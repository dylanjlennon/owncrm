import Link from 'next/link';
import { formatDate } from '@/lib/time';
import { REPEAT_CHOICES, SNOOZE_CHOICES, repeatLabel } from '@/lib/followups';
import { editFollowUp, markDone, snoozeFollowUp } from '@/app/(app)/contacts/actions';

// One follow-up with Done, Snooze and Edit. Used on Today and on each contact.
export function FollowUpItem({ task, back, who }: { task: any; back: string; who?: { id: string; name: string } }) {
  const repeat = repeatLabel(task.repeat_days);
  return (
    <li className={task.overdue ? 'due' : ''} data-testid="followup">
      <span className="grow">
        {who && <><Link href={`/contacts/${who.id}`}>{who.name}</Link>: </>}{task.title}<br />
        <small className={task.overdue ? 'overdue' : ''}>{task.overdue ? 'Overdue since ' : 'Due '}{formatDate(task.due_on)}{repeat ? `, repeats: ${repeat.toLowerCase()}` : ''}</small>
        <details className="edit">
          <summary>Edit</summary>
          <form action={editFollowUp} className="row">
            <input type="hidden" name="id" value={task.id} /><input type="hidden" name="back" value={back} />
            {task.repeat_days ? <input type="hidden" name="had_repeat" value="yes" /> : null}
            <label className="u-f160">What<input name="title" maxLength={300} defaultValue={task.title} /></label>
            <label>When<input name="due_on" type="date" required defaultValue={task.due_on} /></label>
            <label>Repeat<select name="repeat_days" defaultValue={task.repeat_days ?? ''}><option value="">Does not repeat</option>{REPEAT_CHOICES.map((c) => <option key={c.days} value={c.days}>{c.label}</option>)}</select></label>
            <button className="quiet" type="submit">Save</button>
          </form>
        </details>
      </span>
      <form action={snoozeFollowUp} className="inline snooze">
        <input type="hidden" name="id" value={task.id} /><input type="hidden" name="back" value={back} />
        <select name="snooze" aria-label="Snooze until" defaultValue="1d">{Object.entries(SNOOZE_CHOICES).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}</select>
        <button className="quiet" type="submit">Snooze</button>
      </form>
      <form action={markDone} className="inline"><input type="hidden" name="id" value={task.id} /><input type="hidden" name="back" value={back} /><button className="quiet" type="submit">Done</button></form>
    </li>
  );
}
