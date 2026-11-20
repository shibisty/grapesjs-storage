/**
 * Jodit (MIT) for HTML fields, loaded from a CDN the first time a form
 * with such a field opens. Without it (offline, blocked) the field stays a
 * plain textarea with the HTML.
 */
export interface HtmlEditorOptions {
  /** Script URL; `false` turns the rich editor off (a textarea with HTML). */
  js?: string | false;
  css?: string;
  /** Extra options for `Jodit.make`. */
  config?: Record<string, unknown>;
}

export const JODIT_VERSION = '4.20.4';
export const JODIT_JS = `https://cdn.jsdelivr.net/npm/jodit@${JODIT_VERSION}/es2021/jodit.fat.min.js`;
export const JODIT_CSS = `https://cdn.jsdelivr.net/npm/jodit@${JODIT_VERSION}/es2021/jodit.fat.min.css`;

let loading: Promise<any> | null = null;

/** The global `Jodit`, loading it once (resolves to null when it cannot be loaded). */
export function loadJodit(o: HtmlEditorOptions = {}): Promise<any> {
  const w = window as any;
  if (w.Jodit?.make) return Promise.resolve(w.Jodit);
  if (o.js === false) return Promise.resolve(null);
  if (loading) return loading;
  const js = o.js || JODIT_JS;
  const css = o.css || (o.js ? '' : JODIT_CSS);
  loading = new Promise((resolve) => {
    if (css && !document.querySelector(`link[data-gjss-jodit]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = css;
      link.setAttribute('data-gjss-jodit', '');
      document.head.appendChild(link);
    }
    const s = document.createElement('script');
    s.src = js;
    s.async = true;
    s.onload = () => resolve(w.Jodit?.make ? w.Jodit : null);
    s.onerror = () => {
      loading = null;
      resolve(null);
    };
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * Turns a textarea into a Jodit editor; `onChange` gets the HTML. Returns
 * the remover (the textarea stays usable when Jodit is not there).
 */
export function attachHtmlEditor(
  area: HTMLTextAreaElement,
  onChange: (html: string) => void,
  o: HtmlEditorOptions & { language?: string; dark?: boolean } = {}
): () => void {
  let editor: any = null;
  let gone = false;
  void loadJodit(o).then((Jodit) => {
    if (!Jodit || gone || !area.isConnected) return;
    try {
      editor = Jodit.make(area, {
        language: (o.language || 'en').split('-')[0],
        theme: o.dark ? 'dark' : 'default',
        toolbarAdaptive: true,
        minHeight: 180,
        askBeforePasteHTML: false,
        askBeforePasteFromWord: false,
        defaultActionOnPaste: 'insert_clear_html',
        buttons: 'bold,italic,underline,strikethrough,|,ul,ol,|,paragraph,|,link,image,table,|,align,|,undo,redo,|,source',
        ...(o.config || {}),
      });
      editor.events.on('change', (v: string) => onChange(v));
    } catch {
      editor = null; // a broken build: the textarea stays
    }
  });
  return () => {
    gone = true;
    try {
      editor?.destruct();
    } catch {
      /* already gone */
    }
  };
}
