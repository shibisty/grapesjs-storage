export const STYLE_ID = 'gjss-style';

export const CSS = `
.gjss{display:flex;flex-direction:column;min-height:100%;font-size:13px;text-align:start;font-family:var(--gjs-main-font,Helvetica,sans-serif)}
.gjss[hidden]{display:none !important}
.gjss-head{display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-bottom:1px solid rgba(0,0,0,.25);font-weight:600}
.gjss-body{overflow:auto;padding-bottom:12px}
.gjss-btn{background:none;border:0;color:inherit;cursor:pointer;padding:4px 7px;border-radius:3px;font-size:15px;line-height:1}
.gjss-btn:hover{background:rgba(255,255,255,.12)}
.gjss-bar{display:flex;align-items:center;gap:4px;padding:6px 6px 0}
.gjss-bar .gjss-section{flex:1;margin:0;padding:6px 4px}
.gjss-section{margin:0;padding:10px 10px 4px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;opacity:.7}
.gjss-list{list-style:none;margin:0;padding:0}
.gjss-item{display:flex;align-items:center;gap:6px;padding:8px 10px;cursor:pointer;border-left:3px solid transparent}
.gjss-item:hover,.gjss-item:focus-visible{background:rgba(255,255,255,.06);outline:none}
.gjss-item.is-active{border-left-color:var(--gjs-quaternary-color,#d278c9)}
.gjss-main{flex:1;min-width:0}
.gjss-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gjss-sub{font-size:10px;opacity:.6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gjss-fieldrow{display:flex;gap:8px;align-items:baseline;padding:4px 10px}
.gjss-fieldrow code{font-size:12px}
.gjss-act{background:none;border:0;color:inherit;cursor:pointer;padding:2px 5px;border-radius:3px;font-size:12px}
.gjss-act:hover{background:rgba(255,255,255,.15)}
.gjss-act[disabled]{opacity:.3;cursor:default}
.gjss-hint{padding:4px 10px;opacity:.7;font-size:12px;margin:4px 0}
.gjss-warn{padding:2px 10px;margin:2px 0;color:#ffb74d;font-size:12px}
.gjss-err,.gjss-err span{color:#ff8a80}
.gjss-search{display:block;width:calc(100% - 20px);box-sizing:border-box;margin:4px 10px 6px;padding:5px 8px;background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.15);border-radius:3px;color:inherit;font:inherit}
.gjss-meta,.gjss-field{display:block;padding:4px 10px}
.gjss-field>label,.gjss-meta{font-size:11px;opacity:.85}
.gjss-input{display:block;width:100%;box-sizing:border-box;margin:3px 0 4px;padding:5px 8px;background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.2);color:inherit;border-radius:3px;font:inherit}
.gjss-input option{color:#222}
.gjss-row{display:flex;gap:4px;align-items:center}
.gjss-row .gjss-input{flex:1}
.gjss-check{display:flex;align-items:center;gap:6px}
.gjss-items{display:flex;flex-direction:column;gap:6px}
.gjss-item fieldset,.gjss-items fieldset{border:1px solid rgba(255,255,255,.15);border-radius:4px;margin:0;padding:2px 0 6px}
.gjss-items legend{font-size:11px;padding:0 4px;opacity:.85}
.gjss-state{padding:6px 10px;font-size:11px;opacity:.8;display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.gjss-actions{display:flex;gap:6px;padding:10px}
.gjss-primary,.gjss-secondary{padding:6px 12px;border-radius:3px;border:0;cursor:pointer;color:inherit;font:inherit}
.gjss-primary{background:var(--gjs-quaternary-color,#d278c9)}
.gjss-secondary{background:rgba(255,255,255,.15)}
.gjss-fields .gjss-secondary{margin:6px 10px}
.gjss.gjss-inline{width:100%;height:100%;overflow:hidden;background:var(--gjs-primary-color,#444)}
.gjss.gjss-floating{position:absolute;top:0;right:0;bottom:0;width:300px;z-index:50;box-shadow:-2px 0 8px rgba(0,0,0,.35);background:var(--gjs-primary-color,#444)}
.gjss-toggle{position:absolute;top:8px;right:48px;z-index:60;background:var(--gjs-primary-color,#444);color:var(--gjs-font-color,#ddd);border:1px solid rgba(255,255,255,.2);border-radius:4px;padding:6px 10px;cursor:pointer}
`;

export function injectCss(doc: Document = document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const s = doc.createElement('style');
  s.id = STYLE_ID;
  s.textContent = CSS;
  doc.head.appendChild(s);
}
