'use client';
import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { Button } from './ui/button';
import { Modal, Command, nextSunday } from './shared';

export function RunForm({ command, onClose }: { command: Command; onClose: () => void }) {
  const [group, setGroup] = useState('RANKING');
  return (
    <Modal title="Schedule a Secret Room run" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          if (
            await command('createRun', {
              group,
              scheduledAt: new Date(`${f.get('date')}+08:00`).toISOString(),
              target: group === 'RANKING' ? 24 : Number(f.get('target')),
              allowOverlap: f.get('overlap') === 'on',
            })
          )
            onClose();
        }}
      >
        <label>
          Run group
          <select value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="RANKING">Group 1 · Ranking run</option>
            <option value="DROP">Group 2 · Drop run</option>
          </select>
        </label>
        <label>
          Scheduled time · Asia/Manila
          <input name="date" type="datetime-local" required defaultValue={nextSunday()} />
        </label>
        <label>
          Participants
          <input
            name="target"
            type="number"
            min="1"
            max="24"
            defaultValue="24"
            disabled={group === 'RANKING'}
          />
        </label>
        <label className="checkbox-label">
          <input type="checkbox" name="overlap" />
          Allow this run to share members with overlapping runs
        </label>
        <p className="form-help">
          Both overlapping runs must permit shared members. Ranking runs always require three
          parties of eight.
        </p>
        <div className="modal-actions">
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button>
            <CalendarDays size={15} />
            Schedule run
          </Button>
        </div>
      </form>
    </Modal>
  );
}
