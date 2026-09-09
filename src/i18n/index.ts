// ───────────────────────────────────────────────────────────────────────────
// i18n — ENGLISCH ist die Quellsprache (E-28, Eigentuemer 2026-09-09).
//
// Der englische Text steht inline als Fallback: `t('menu.file', 'File')`.
// Jede weitere Sprache ist ein Woerterbuch, das ihn ueberschreibt; fehlt ein
// Schluessel, erscheint der englische Quelltext. Wickeln kann deshalb nichts
// kaputtmachen.
//
// WAS SICH AM 2026-09-09 GEDREHT HAT — UND WARUM. Bis dahin galt E-17/E-20:
// die Quellsprache war eine Eigenschaft des Repos, cable-planner und
// light-planner waren deutsch-quellig. E-28 hebt das auf: alle Repos sind
// englisch-quellig, Deutsch ist die erste Uebersetzung, weitere folgen.
//
// Der Wechsel war ein TAUSCH und keine Uebersetzung: alle 840 Schluessel
// trugen bereits eine englische Fassung, der Rundlauf ist geprueft.
//
// ─── EINE WEITERE SPRACHE ───────────────────────────────────────────────────
//
//   1. `src/i18n/<kuerzel>.ts` anlegen, gebaut wie `de.ts`.
//   2. Hier importieren und in `WOERTERBUECHER` eintragen.
//   3. `SPRACHEN` bekommt den Eintrag fuer die Auswahl.
//
// Mehr ist es nicht — kein `if`, kein Sonderfall. Das ist der Punkt der
// Registry: die Anzahl der Sprachen ist eine Angabe und keine Verzweigung.
// Frueher stand hier `language === 'en' && en[key]`, und jede dritte Sprache
// haette diese Zeile anfassen muessen.
//
// Verwendung:  const { t } = useTranslation();  t('menu.file', 'File')
// Die Sprache lebt im uiStore (passend zu einem Wirt, dem sie gehoert).
// ───────────────────────────────────────────────────────────────────────────
import { useUiStore } from '../store/uiStore';
import { de } from './de';

/** Die Quellsprache. Sie braucht kein Woerterbuch — sie steht im JSX. */
export const QUELLSPRACHE = 'en' as const;

/** Was es gibt. Der Schluessel ist der BCP-47-Code, der Wert der Eigenname. */
export const SPRACHEN = {
  en: 'English',
  de: 'Deutsch',
} as const;

export type Language = keyof typeof SPRACHEN;

/**
 * Die Woerterbuecher. Englisch fehlt hier mit Absicht: es IST der Fallback.
 * Ein leerer Eintrag fuer die Quellsprache waere eine Kopie, die auseinander-
 * laufen kann.
 */
const WOERTERBUECHER: Partial<Record<Language, Record<string, string>>> = { de };

/**
 * Der Nachschlag. Eine Sprache ohne Woerterbuch — die Quellsprache oder eine
 * erst halb gepflegte — faellt auf den englischen Quelltext zurueck, Schluessel
 * fuer Schluessel. Es gibt bewusst keinen Zustand „Sprache eingestellt, aber
 * nichts uebersetzt": dann stuenden dort die Schluesselnamen.
 */
export function translate(language: Language, key: string, en: string): string {
  return WOERTERBUECHER[language]?.[key] ?? en;
}

/**
 * Platzhalter einsetzen: format(t('x', 'Delete all {n}'), { n: 5 }).
 *
 * WARUM ES DAS BRAUCHT, statt einen Satz aus mehreren `t()`-Aufrufen
 * zusammenzusetzen: die Wortstellung gehoert zur Sprache. „Alle {n} löschen"
 * und „Delete all {n}" stellen Zahl und Verb verschieden; wer den Satz aus
 * Bruchstuecken baut, friert eine Reihenfolge ein und bekommt in jeder
 * weiteren Sprache Kauderwelsch. Ein Schluessel, ein ganzer Satz.
 */
export function format(vorlage: string, werte: Record<string, string | number>): string {
  return vorlage.replace(/\{(\w+)\}/g, (_, k) => (werte[k] === undefined ? `{${k}}` : String(werte[k])));
}

/** Hook: liefert ein an die Sprache gebundenes `t(key, en)` plus die Sprache. */
export function useTranslation() {
  const language = useUiStore((s) => s.language);
  const setLanguage = useUiStore((s) => s.setLanguage);
  return {
    t: (key: string, en: string) => translate(language, key, en),
    language,
    setLanguage,
  };
}
