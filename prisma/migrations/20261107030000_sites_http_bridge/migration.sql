-- Private, service-role-only HTTPS RPC transport for the Sites Cloudflare Worker.
-- All tables, snapshots, revision checks and audit history remain normalized.
CREATE OR REPLACE FUNCTION public.stoics_sites_profile(p_actor uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT to_jsonb(u)-'passwordHash' FROM public."User" u WHERE u."authUserId"=p_actor;
$$;

CREATE OR REPLACE FUNCTION public.stoics_sites_state(p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE u public."User"; g public."Guild"; result jsonb;
BEGIN
 SELECT * INTO STRICT u FROM public."User" WHERE "authUserId"=p_actor;
 SELECT * INTO STRICT g FROM public."Guild" WHERE id=u."guildId";
 result=jsonb_build_object('user',jsonb_build_object('email',u.email,'role',u.role),'revision',g.revision,
 'members',(SELECT coalesce(jsonb_agg((to_jsonb(m)-'guildId'-'normalizedName'-'createdAt') ||
   jsonb_build_object('roles',(SELECT coalesce(jsonb_agg(c.role ORDER BY c.role),'[]') FROM public."RoleCapability" c WHERE c."memberId"=m.id)) ||
   coalesce((SELECT to_jsonb(t)-'memberId' FROM public."Rating" t WHERE t."memberId"=m.id),'{"dps":5,"aoe":5,"tank":5,"support":5}') ORDER BY m.name),'[]') FROM public."Member" m WHERE m."guildId"=g.id),
 'runs',(SELECT coalesce(jsonb_agg((to_jsonb(r)-'eventId') || jsonb_build_object('scheduledAt',e."scheduledAt",
   'assignments',(SELECT coalesce(jsonb_agg(jsonb_build_object('memberId',a."memberId",'party',p.number,'slot',a.slot,'role',a.role,'locked',a.locked) ORDER BY p.number,a.slot),'[]') FROM public."Assignment" a JOIN public."Party" p ON p.id=a."partyId" WHERE a."runId"=r.id),
   'availability',(SELECT coalesce(jsonb_agg(jsonb_build_object('memberId',v."memberId",'available',v.available)),'[]') FROM public."Availability" v WHERE v."runId"=r.id)) ORDER BY e."scheduledAt" DESC),'[]') FROM public."Run" r JOIN public."Event" e ON e.id=r."eventId" WHERE e."guildId"=g.id AND r.status<>'COMPLETED'),
 'history',(SELECT coalesce(jsonb_agg((to_jsonb(r)-'eventId') || jsonb_build_object('scheduledAt',e."scheduledAt",'attendance',
   (SELECT coalesce(jsonb_agg(jsonb_build_object('memberId',a."memberId",'present',a.present,'party',a.party,'role',a.role,'snapshot',a.snapshot)),'[]') FROM public."Attendance" a WHERE a."runId"=r.id)) ORDER BY e."scheduledAt" DESC),'[]') FROM public."Run" r JOIN public."Event" e ON e.id=r."eventId" WHERE e."guildId"=g.id AND r."finalizedAt" IS NOT NULL),
 'settings',jsonb_build_object('weights',coalesce(g.settings->'weights','{"performance":6,"fairness":3,"core":2,"balance":5}'),'icons',
   (SELECT coalesce(jsonb_object_agg(c.name,c.icon),'{}') FROM public."CharacterClass" c WHERE c."guildId"=g.id AND c.icon IS NOT NULL)),
 'audits',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x."createdAt" DESC),'[]') FROM
   (SELECT a.id,a.action,v.email AS actor,a."createdAt" FROM public."AuditLog" a JOIN public."User" v ON v.id=a."actorId" WHERE a."guildId"=g.id ORDER BY a."createdAt" DESC LIMIT 30) x));
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.stoics_sites_member(p_guild text,p_member jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE mid text:=p_member->>'id'; r text;
BEGIN
 IF EXISTS(SELECT 1 FROM public."Member" WHERE id=mid AND "guildId"<>p_guild) THEN RAISE EXCEPTION 'Member outside this guild'; END IF;
 INSERT INTO public."Member" (id,"guildId",name,"normalizedName",job,level,"primaryRole",status,"highDps","highAoe",core,available,equipment,notes)
 VALUES(mid,p_guild,p_member->>'name',p_member->>'normalizedName',p_member->>'job',(p_member->>'level')::int,p_member->>'primaryRole',p_member->>'status',(p_member->>'highDps')::boolean,(p_member->>'highAoe')::boolean,(p_member->>'core')::boolean,(p_member->>'available')::boolean,p_member->>'equipment',p_member->>'notes')
 ON CONFLICT(id) DO UPDATE SET name=excluded.name,"normalizedName"=excluded."normalizedName",job=excluded.job,level=excluded.level,"primaryRole"=excluded."primaryRole",status=excluded.status,"highDps"=excluded."highDps","highAoe"=excluded."highAoe",core=excluded.core,available=excluded.available,equipment=excluded.equipment,notes=excluded.notes;
 DELETE FROM public."RoleCapability" WHERE "memberId"=mid;
 FOR r IN SELECT jsonb_array_elements_text(p_member->'roles') LOOP INSERT INTO public."RoleCapability" VALUES(mid,r); END LOOP;
 INSERT INTO public."Rating" ("memberId",dps,aoe,tank,support) VALUES(mid,(p_member->>'dps')::int,(p_member->>'aoe')::int,(p_member->>'tank')::int,(p_member->>'support')::int)
 ON CONFLICT("memberId") DO UPDATE SET dps=excluded.dps,aoe=excluded.aoe,tank=excluded.tank,support=excluded.support;
END $$;

CREATE OR REPLACE FUNCTION public.stoics_sites_commit(p_actor uuid,p_revision int,p_action text,p_changes jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE u public."User"; g public."Guild"; r public."Run"; item jsonb; mid text; eid text; rid text; pid text; part int; snap jsonb;
BEGIN
 SELECT * INTO STRICT u FROM public."User" WHERE "authUserId"=p_actor;
 IF u.role NOT IN ('ADMIN','OFFICER') THEN RAISE EXCEPTION 'Management access required'; END IF;
 IF p_action IN ('settings','icon','user','deleteMember') AND u.role<>'ADMIN' THEN RAISE EXCEPTION 'Administrator access required'; END IF;
 IF p_action NOT IN ('member','deleteMember','bulk','import','createRun','saveRoster','generate','finalize','attendance','runSettings','settings','icon','user') THEN RAISE EXCEPTION 'Unknown action'; END IF;
 SELECT * INTO STRICT g FROM public."Guild" WHERE id=u."guildId" FOR UPDATE;
 IF g.revision<>p_revision THEN RAISE EXCEPTION 'The guild changed in another session. Refresh and try again.'; END IF;
 IF p_action IN ('member','bulk','import') THEN
   FOR item IN SELECT jsonb_array_elements(p_changes->'members') LOOP PERFORM public.stoics_sites_member(g.id,item); END LOOP;
 ELSIF p_action='deleteMember' THEN
   mid=p_changes->>'id';
   IF NOT EXISTS(SELECT 1 FROM public."Member" WHERE id=mid AND "guildId"=g.id) THEN RAISE EXCEPTION 'Member not found'; END IF;
   IF EXISTS(SELECT 1 FROM public."Assignment" WHERE "memberId"=mid) OR EXISTS(SELECT 1 FROM public."Attendance" WHERE "memberId"=mid) THEN RAISE EXCEPTION 'Archive this character to preserve run history'; END IF;
   DELETE FROM public."Member" WHERE id=mid;
 ELSIF p_action='createRun' THEN
   SELECT id INTO eid FROM public."Event" WHERE "guildId"=g.id AND "scheduledAt"=(p_changes->>'scheduledAt')::timestamptz;
   IF eid IS NULL THEN eid=gen_random_uuid()::text; INSERT INTO public."Event" VALUES(eid,g.id,(p_changes->>'scheduledAt')::timestamptz); END IF;
   rid=gen_random_uuid()::text;
   INSERT INTO public."Run" (id,"eventId","group",target,"allowOverlap") VALUES(rid,eid,p_changes->>'group',(p_changes->>'target')::int,(p_changes->>'allowOverlap')::boolean);
   FOR part IN 0..2 LOOP INSERT INTO public."Party" VALUES(gen_random_uuid()::text,rid,part); END LOOP;
 ELSIF p_action='settings' THEN UPDATE public."Guild" SET settings=jsonb_build_object('weights',p_changes) WHERE id=g.id;
 ELSIF p_action='icon' THEN
   INSERT INTO public."CharacterClass" (id,name,icon,"guildId") VALUES(gen_random_uuid()::text,p_changes->>'job',p_changes->>'icon',g.id) ON CONFLICT("guildId",name) DO UPDATE SET icon=excluded.icon;
 ELSIF p_action='user' THEN
   IF EXISTS(SELECT 1 FROM public."User" WHERE email=p_changes->>'email' AND ("guildId"<>g.id OR "authUserId" IS NOT NULL)) THEN RAISE EXCEPTION 'An account with this email already exists'; END IF;
   INSERT INTO public."User" (id,email,"authUserId",role,"guildId") VALUES(gen_random_uuid()::text,p_changes->>'email',(p_changes->>'authUserId')::uuid,p_changes->>'role',g.id)
   ON CONFLICT(email) DO UPDATE SET "authUserId"=excluded."authUserId",role=excluded.role,"passwordHash"=NULL;
 ELSE
   SELECT rr.* INTO STRICT r FROM public."Run" rr JOIN public."Event" e ON e.id=rr."eventId" WHERE rr.id=p_changes->>'runId' AND e."guildId"=g.id FOR UPDATE OF rr;
   IF p_action='attendance' THEN
     IF r.status<>'FINALIZED' THEN RAISE EXCEPTION 'Finalize the planned roster first'; END IF;
     FOR item IN SELECT jsonb_array_elements(p_changes->'rows') LOOP
       mid=item->>'memberId';
       SELECT value INTO STRICT snap FROM jsonb_array_elements(public.stoics_sites_state(p_actor)->'members') WHERE value->>'id'=mid;
       INSERT INTO public."Attendance" (id,"runId","memberId",present,party,role,snapshot) VALUES(gen_random_uuid()::text,r.id,mid,(item->>'present')::boolean,(item->>'party')::int,item->>'role',snap);
     END LOOP;
     UPDATE public."Run" SET status='COMPLETED',"finalizedAt"=now(),duration=(p_changes->>'duration')::int,ranking=(p_changes->>'ranking')::int,drops=p_changes->>'drops',notes=p_changes->>'notes' WHERE id=r.id;
   ELSE
     IF r.status<>'DRAFT' THEN RAISE EXCEPTION 'The planned roster is finalized'; END IF;
     IF p_action='runSettings' THEN
       UPDATE public."Run" SET target=(p_changes->>'target')::int,"allowOverlap"=(p_changes->>'allowOverlap')::boolean,exclusions=ARRAY(SELECT jsonb_array_elements_text(p_changes->'exclusions')) WHERE id=r.id;
       DELETE FROM public."Availability" WHERE "runId"=r.id;
       FOR item IN SELECT jsonb_array_elements(p_changes->'availability') LOOP
         IF NOT EXISTS(SELECT 1 FROM public."Member" WHERE id=item->>'memberId' AND "guildId"=g.id) THEN RAISE EXCEPTION 'Member outside this guild'; END IF;
         INSERT INTO public."Availability" VALUES(gen_random_uuid()::text,item->>'memberId',r.id,(item->>'available')::boolean);
       END LOOP;
     ELSIF p_action='finalize' THEN UPDATE public."Run" SET status='FINALIZED' WHERE id=r.id;
     ELSE
       IF p_changes ? 'target' THEN UPDATE public."Run" SET target=(p_changes->>'target')::int WHERE id=r.id; END IF;
       DELETE FROM public."Assignment" WHERE "runId"=r.id;
       FOR item IN SELECT jsonb_array_elements(p_changes->'assignments') LOOP
         SELECT id INTO STRICT pid FROM public."Party" WHERE "runId"=r.id AND number=(item->>'party')::int;
         SELECT value INTO STRICT snap FROM jsonb_array_elements(public.stoics_sites_state(p_actor)->'members') WHERE value->>'id'=item->>'memberId';
         INSERT INTO public."Assignment" (id,"runId","partyId","memberId",slot,role,locked,snapshot) VALUES(gen_random_uuid()::text,r.id,pid,item->>'memberId',(item->>'slot')::int,item->>'role',(item->>'locked')::boolean,snap);
       END LOOP;
       INSERT INTO public."RosterVersion" (id,"runId","actorId",assignments) VALUES(gen_random_uuid()::text,r.id,u.id,p_changes->'assignments');
     END IF;
   END IF;
 END IF;
 UPDATE public."Guild" SET revision=revision+1 WHERE id=g.id;
 INSERT INTO public."AuditLog" (id,"guildId","actorId",action,details) VALUES(gen_random_uuid()::text,g.id,u.id,p_action,p_changes);
END $$;

CREATE OR REPLACE FUNCTION public.stoics_sites_analysis(p_actor uuid,p_run text,p_prompt text,p_response jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE u public."User";
BEGIN
 SELECT * INTO STRICT u FROM public."User" WHERE "authUserId"=p_actor;
 IF u.role NOT IN ('ADMIN','OFFICER') OR NOT EXISTS(SELECT 1 FROM public."Run" r JOIN public."Event" e ON e.id=r."eventId" WHERE r.id=p_run AND e."guildId"=u."guildId") THEN RAISE EXCEPTION 'Officer access required'; END IF;
 INSERT INTO public."Analysis" (id,"runId","actorId",prompt,response) VALUES(gen_random_uuid()::text,p_run,u.id,p_prompt,p_response);
 INSERT INTO public."AuditLog" (id,"guildId","actorId",action,details) VALUES(gen_random_uuid()::text,u."guildId",u.id,'aiAnalysis',jsonb_build_object('runId',p_run));
END $$;

-- Never grant these routines to browser users. The Worker verifies Supabase Auth,
-- validates commands with the shared domain rules, then calls with a server secret.
DO $$
DECLARE signature text; role_name text;
BEGIN
 FOREACH signature IN ARRAY ARRAY['public.stoics_sites_profile(uuid)','public.stoics_sites_state(uuid)','public.stoics_sites_member(text,jsonb)','public.stoics_sites_commit(uuid,integer,text,jsonb)','public.stoics_sites_analysis(uuid,text,text,jsonb)'] LOOP
   EXECUTE 'REVOKE ALL ON FUNCTION '||signature||' FROM PUBLIC';
   FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
     IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN EXECUTE 'REVOKE ALL ON FUNCTION '||signature||' FROM '||quote_ident(role_name); END IF;
   END LOOP;
   IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') AND signature<>'public.stoics_sites_member(text,jsonb)' THEN EXECUTE 'GRANT EXECUTE ON FUNCTION '||signature||' TO service_role'; END IF;
 END LOOP;
END $$;
