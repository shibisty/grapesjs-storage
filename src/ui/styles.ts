import { mediaCss } from './media';
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
.gjss-twisty{width:12px;opacity:.6;font-size:10px}
.gjss-editor{list-style:none;padding:2px 0 8px;background:rgba(0,0,0,.12)}
.gjss-frows{display:flex;flex-direction:column;gap:6px;padding:0 10px}
.gjss-frow{border:1px solid rgba(255,255,255,.12);border-radius:4px;padding:4px 6px}
.gjss-frow .gjss-row{gap:6px}
.gjss-frow .gjss-input{margin:2px 0}
.gjss-frow select.gjss-input{flex:1}
.gjss-frow .gjss-check{font-size:11px;white-space:nowrap}
.gjss-code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px}
.gjss-input.is-invalid{border-color:#ff8a80}
.gjss-tpl>.gjss-secondary{margin:8px 10px 0}
.gjss-data-form .gjss-field{padding:4px 10px}
.gjss-req{color:#ff8a80}
.gjss-field.has-problem .gjss-input,.gjss-field.has-problem .jodit-container{border-color:#ff8a80 !important}
.gjss-data-form textarea.gjss-input{resize:vertical;min-height:4em}
.gjss-data-form .jodit-container{margin:3px 0 4px;color:#222}
.gjss-modal{min-width:min(560px,80vw)}
.gjss-modal .gjss-data-form .gjss-field{padding:4px 0}
.gjss-modal .gjss-actions{padding:10px 0 0}
.gjss-dialog-field{display:block;margin:4px 0 10px}
.gjss-dialog-data .gjss-data-form .gjss-field{padding:4px 0}
.gjss-dialog-data .gjss-hint,.gjss-modal .gjss-hint{padding:4px 0}
.gjss-fields{display:flex;flex-wrap:wrap;gap:0 8px}
.gjss-fields>.gjss-field,.gjss-fields>.gjss-tabs,.gjss-fields>.gjss-tab-pane,.gjss-fields>.gjss-accordion{flex:1 1 100%;min-width:0}
.gjss-field[hidden],.gjss-tab-pane[hidden],.gjss-accordion[hidden],.gjss-tab[hidden]{display:none !important}
.gjss-label{display:block;font-size:11px;opacity:.9;margin-bottom:2px}
.gjss-instructions{display:block;font-size:11px;opacity:.6;margin:0 0 3px}
.gjss-affix{display:flex;align-items:stretch}
.gjss-affix>span{display:flex;align-items:center;padding:0 7px;margin:3px 0 4px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2);font-size:12px;opacity:.85}
.gjss-affix>span:first-child{border-right:0;border-radius:3px 0 0 3px}
.gjss-affix>span:last-child{border-left:0;border-radius:0 3px 3px 0}
.gjss-affix>.gjss-input,.gjss-affix>.gjss-range{flex:1;min-width:0}
.gjss-range{display:flex;align-items:center;gap:8px}
.gjss-range input{flex:1}
.gjss-range-value{min-width:2.5em;text-align:end;font-variant-numeric:tabular-nums}
.gjss-choices{display:flex;flex-direction:column;gap:3px;margin:3px 0 4px}
.gjss-choices.is-horizontal{flex-direction:row;flex-wrap:wrap;gap:4px 14px}
.gjss-button-group{display:inline-flex;margin:3px 0 4px;border:1px solid rgba(255,255,255,.25);border-radius:3px;overflow:hidden}
.gjss-bg{background:none;border:0;border-inline-end:1px solid rgba(255,255,255,.2);color:inherit;padding:5px 11px;cursor:pointer;font:inherit}
.gjss-bg:last-child{border-inline-end:0}
.gjss-bg.is-active{background:var(--gjs-quaternary-color,#d278c9);color:#fff}
.gjss-switch{display:inline-flex;align-items:center;gap:8px;cursor:pointer;margin:3px 0 4px}
.gjss-switch input{position:absolute;opacity:0;pointer-events:none}
.gjss-switch-ui{display:inline-block;flex:0 0 auto;width:30px;height:16px;border-radius:8px;background:rgba(255,255,255,.25);position:relative;transition:background .15s}
.gjss-switch-ui::after{content:"";position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:#fff;transition:transform .15s}
.gjss-switch input:checked+.gjss-switch-ui{background:var(--gjs-quaternary-color,#d278c9)}
.gjss-switch input:checked+.gjss-switch-ui::after{transform:translateX(14px)}
.gjss-switch input:focus-visible+.gjss-switch-ui{outline:2px solid var(--gjs-quaternary-color,#d278c9);outline-offset:2px}
.gjss-group{border:1px solid rgba(255,255,255,.14);border-radius:4px;padding:4px 8px 6px;margin:3px 0 6px}
.gjss-group.is-row>.gjss-fields>.gjss-field,.gjss-repeater.is-row .gjss-rrow-body>.gjss-fields>.gjss-field{display:grid;grid-template-columns:30% 1fr;gap:0 8px;align-items:start}
.gjss-group.is-row .gjss-label,.gjss-repeater.is-row .gjss-label{margin-top:8px}
.gjss-group.is-row .gjss-instructions,.gjss-repeater.is-row .gjss-instructions{grid-column:1}
.gjss-group.is-table>.gjss-fields,.gjss-repeater.is-table .gjss-rrow-body>.gjss-fields{flex-wrap:nowrap}
.gjss-group.is-table>.gjss-fields>.gjss-field,.gjss-repeater.is-table .gjss-rrow-body>.gjss-fields>.gjss-field{flex:1 1 0}
.gjss-repeater{display:flex;flex-direction:column;gap:6px;margin:3px 0 6px}
.gjss-rrow{border:1px solid rgba(255,255,255,.16);border-radius:4px;background:rgba(0,0,0,.12)}
.gjss-rrow-head{display:flex;align-items:center;gap:2px;padding:3px 4px;border-bottom:1px solid rgba(255,255,255,.1);font-size:12px}
.gjss-rrow.is-collapsed .gjss-rrow-head{border-bottom:0}
.gjss-rrow.is-collapsed .gjss-rrow-body{display:none}
.gjss-rrow-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.85}
.gjss-rrow-body{padding:2px 8px 6px}
.gjss-repeater>.gjss-secondary{align-self:flex-start}
.gjss-media{display:flex;flex-direction:column;gap:4px;margin:3px 0 4px}
.gjss-media .gjss-row{gap:6px}
.gjss-sources{flex-wrap:wrap}
.gjss-chooser-label{font-size:11px;opacity:.75;margin-inline-end:2px}
.gjss-url-row[hidden]{display:none}
.gjss-url-row{margin-top:4px}
.gjss-url-row .gjss-input{margin:0}
.gjss-sources .gjss-secondary[disabled]{opacity:.45;cursor:default}
.gjss-thumb{max-width:100%;max-height:140px;object-fit:contain;align-self:flex-start;border-radius:3px;background:rgba(255,255,255,.06)}
.gjss-file{word-break:break-all;color:inherit}
.gjss-gallery-items{display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:6px}
.gjss-gallery-item{position:relative;border-radius:3px;overflow:hidden;background:rgba(255,255,255,.06)}
.gjss-gallery-item img{display:block;width:100%;height:72px;object-fit:cover}
.gjss-gallery-acts{display:flex;justify-content:center;background:rgba(0,0,0,.45)}
.gjss-gallery-acts .gjss-act{padding:1px 4px}
.gjss-link{display:flex;flex-direction:column}
.gjss-link .gjss-check{font-size:12px}
.gjss-message p{margin:2px 0 6px;opacity:.85;white-space:pre-wrap}
.gjss-tabs{display:flex;flex-wrap:wrap;gap:2px;border-bottom:1px solid rgba(255,255,255,.15);margin:4px 0 6px}
.gjss-tab{background:none;border:0;border-bottom:2px solid transparent;color:inherit;opacity:.7;cursor:pointer;padding:5px 10px;font:inherit;margin-bottom:-1px}
.gjss-tab.is-active{opacity:1;border-bottom-color:var(--gjs-quaternary-color,#d278c9)}
.gjss-accordion{border:1px solid rgba(255,255,255,.14);border-radius:4px;margin:4px 0 6px;padding:0 8px}
.gjss-accordion>summary{cursor:pointer;padding:6px 0;font-weight:600}
.gjss-accordion[open]>summary{border-bottom:1px solid rgba(255,255,255,.1);margin-bottom:4px}
.gjss-template-editor{min-width:min(760px,90vw);max-height:76vh;overflow:auto}
.gjss-te-list{display:flex;flex-direction:column;gap:4px}
.gjss-te-list>.gjss-secondary{align-self:flex-start;margin-top:4px}
.gjss-te-field{border:1px solid rgba(255,255,255,.14);border-radius:4px;background:rgba(0,0,0,.1)}
.gjss-te-field.is-open{border-color:rgba(255,255,255,.3)}
.gjss-te-head{display:flex;align-items:center;gap:8px;padding:6px 8px;cursor:pointer}
.gjss-te-head:focus-visible{outline:1px solid var(--gjs-quaternary-color,#d278c9)}
.gjss-te-title{flex:1;min-width:0;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gjss-te-name{font-size:11px;opacity:.7}
.gjss-te-type{font-size:11px;padding:1px 6px;border-radius:8px;background:rgba(255,255,255,.1);white-space:nowrap}
.gjss-te-flag{opacity:.7}
.gjss-te-settings{padding:4px 10px 10px;border-top:1px solid rgba(255,255,255,.1)}
.gjss-te-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:0 10px;align-items:end}
.gjss-te-setting{display:block;margin:4px 0}
.gjss-te-setting>span{display:block;font-size:11px;opacity:.85}
.gjss-te-setting.gjss-check{display:flex;align-items:center;gap:6px;min-height:30px}
.gjss-te-cond{margin:8px 0 4px;padding:6px 8px;border-radius:4px;background:rgba(255,255,255,.04)}
.gjss-te-rule{gap:6px;flex-wrap:wrap}
.gjss-te-rule .gjss-input{flex:1 1 120px;margin:3px 0}
.gjss-te-or{font-size:11px;text-transform:uppercase;opacity:.6;margin:4px 0}
.gjss-te-sub{margin-top:8px;padding:6px 0 0 12px;border-inline-start:2px solid rgba(255,255,255,.15)}
.gjss-te-sub>.gjss-section{padding:0 0 4px}
.gjss-ptabs{display:flex;gap:2px;padding:0 6px;border-bottom:1px solid rgba(0,0,0,.25)}
.gjss-ptab{background:none;border:0;border-bottom:2px solid transparent;color:inherit;opacity:.7;cursor:pointer;padding:7px 10px;font:inherit;margin-bottom:-1px}
.gjss-ptab:hover{opacity:1}
.gjss-ptab.is-active{opacity:1;border-bottom-color:var(--gjs-quaternary-color,#d278c9)}
.gjss-flag{font-size:15px;line-height:1;font-family:"Twemoji Mozilla","Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif}
.gjss-langs{display:flex;flex-wrap:wrap;gap:4px;margin:0 0 8px;padding:6px 10px;border-bottom:1px solid rgba(255,255,255,.12)}
.gjss-lang{display:inline-flex;align-items:center;gap:4px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);border-radius:12px;color:inherit;cursor:pointer;padding:2px 9px 2px 6px;font:inherit;font-size:12px}
.gjss-lang.is-active{background:var(--gjs-quaternary-color,#d278c9);border-color:transparent;color:#fff}
.gjss-lang-def{opacity:.8}
.gjss-i18n{display:inline-block;margin-inline-start:6px;font-size:10px;padding:0 5px;border-radius:8px;background:rgba(255,255,255,.12);vertical-align:1px}
.gjss-lrow{display:flex;align-items:center;gap:4px;padding:6px 10px;border-bottom:1px solid rgba(255,255,255,.05)}
.gjss-lrow .gjss-switch{margin:0}
.gjss-lrow .gjss-main{flex:1 1 auto;min-width:0}
.gjss-lrow .gjss-name,.gjss-lrow .gjss-sub{white-space:normal;overflow-wrap:break-word}
.gjss-lrow .gjss-act{padding:2px 3px}
.gjss-lrow .gjss-act[disabled]{opacity:.2}
.gjss-lang-badge{font-size:10px;opacity:.75;white-space:nowrap}
.gjss-langlist{margin-bottom:6px}
`;

/** The Asset Manager overlay comes with the plugin's CSS. */
export const injectMediaCss = (doc: Document = document): void => injectCss(doc);

export function injectCss(doc: Document = document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const s = doc.createElement('style');
  s.id = STYLE_ID;
  s.textContent = CSS + mediaCss('gjss');
  doc.head.appendChild(s);
}
