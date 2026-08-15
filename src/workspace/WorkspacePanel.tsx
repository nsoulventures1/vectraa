import type { ConversionHistoryItem } from './history';
import { purposeLabel } from '../vector/recommendation';

interface WorkspacePanelProps {
  items: ConversionHistoryItem[];
  onClear: () => void;
}

export function WorkspacePanel({ items, onClear }: WorkspacePanelProps) {
  return <section id="workspace" className="workspacePanel" aria-label="My Workspace">
    <div className="workspaceHead">
      <div>
        <span className="sectionKicker">MY WORKSPACE</span>
        <h2>Recent vectors on this device.</h2>
        <p>Vectraa stores only lightweight conversion metadata locally. Your uploaded artwork and generated SVG are not saved in this workspace.</p>
      </div>
      {items.length > 0 && <button className="secondary" onClick={onClear}>Clear history</button>}
    </div>
    {items.length === 0 ? <div className="workspaceEmpty"><strong>No conversion history yet.</strong><span>Your successful vectors will appear here automatically.</span></div> : <div className="workspaceList">
      {items.map((item) => <article key={item.id} className="workspaceItem">
        <div className="workspaceFile"><strong title={item.fileName}>{item.fileName}</strong><span>{new Date(item.createdAt).toLocaleString()}</span></div>
        <div className="workspaceMeta"><span>{purposeLabel(item.purpose)}</span><span>{item.preset}</span><span>Quality {item.qualityScore}/100</span>{typeof item.fidelityScore === 'number' && <span>Fidelity {item.fidelityScore}/100</span>}<span>{item.paths} paths</span><span>{Math.round(item.bytes / 1024)} KB</span></div>
      </article>)}
    </div>}
    <div className="workspacePrivacy"><strong>Local-only workspace</strong><span>Clearing browser storage or using another device removes this history. Optional account sync will be added separately.</span></div>
  </section>;
}
