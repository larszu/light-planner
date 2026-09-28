// Ein kleiner XML-Leser fuer wohlgeformte Beschreibungsdateien (GDTF). Er
// liefert Elemente mit Attributen; Text, Kommentare, CDATA und Verarbeitungs-
// anweisungen werden uebersprungen. Kein DOMParser, damit dieselbe Deutung im
// Browser und in den Node-Pruefungen laeuft.

export interface XmlEl {
  tag: string;
  attrs: Record<string, string>;
  children: XmlEl[];
}

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENT[e] ?? m;
  });

export function parseXml(src: string): XmlEl {
  const root: XmlEl = { tag: '#root', attrs: {}, children: [] };
  const stack: XmlEl[] = [root];
  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt < 0) break;
    if (src.startsWith('<!--', lt)) { i = src.indexOf('-->', lt) + 3; continue; }
    if (src.startsWith('<![CDATA[', lt)) { i = src.indexOf(']]>', lt) + 3; continue; }
    if (src[lt + 1] === '?' || src[lt + 1] === '!') { i = src.indexOf('>', lt) + 1; continue; }
    const gt = src.indexOf('>', lt);
    if (gt < 0) break;
    if (src[lt + 1] === '/') {
      if (stack.length > 1) stack.pop();
      i = gt + 1;
      continue;
    }
    // Attributwerte duerfen `>` enthalten; das Ende des Tags liegt ausserhalb von Anfuehrungszeichen.
    let end = lt + 1;
    let q: string | null = null;
    for (; end < src.length; end++) {
      const c = src[end];
      if (q) { if (c === q) q = null; } else if (c === '"' || c === "'") q = c; else if (c === '>') break;
    }
    let body = src.slice(lt + 1, end);
    const selfClosing = body.endsWith('/');
    if (selfClosing) body = body.slice(0, -1);
    const m = /^([^\s/>]+)/.exec(body);
    const el: XmlEl = { tag: m ? m[1] : '', attrs: {}, children: [] };
    const re = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let a: RegExpExecArray | null;
    while ((a = re.exec(body))) el.attrs[a[1]] = decode(a[3] ?? a[4] ?? '');
    stack[stack.length - 1].children.push(el);
    if (!selfClosing) stack.push(el);
    i = end + 1;
  }
  return root;
}

export const kids = (el: XmlEl | undefined, tag: string): XmlEl[] => el?.children.filter((c) => c.tag === tag) ?? [];
export const kid = (el: XmlEl | undefined, tag: string): XmlEl | undefined => el?.children.find((c) => c.tag === tag);

/** Erstes Element mit diesem Tag irgendwo unterhalb. */
export function find(el: XmlEl, tag: string): XmlEl | undefined {
  for (const c of el.children) {
    if (c.tag === tag) return c;
    const d = find(c, tag);
    if (d) return d;
  }
  return undefined;
}
