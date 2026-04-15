import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import { $prose } from '@milkdown/kit/utils';

const WIKI_LINK_RE = /\[\[([^\]|#]+)(?:#[^\]|]*)?\|?([^\]]*)\]\]/g;
const AUTOCOMPLETE_RE = /\[\[([^\]]*)$/;

function getAutocompleteMatch(state) {
  const { selection } = state;
  if (!selection.empty) return null;

  const { $from, from } = selection;
  if (!$from.parent.isTextblock) return null;

  const textBefore = $from.parent.textBetween(0, $from.parentOffset, '\0', '\0');
  const match = textBefore.match(AUTOCOMPLETE_RE);
  if (!match) return null;

  const query = match[1].split('|')[0].split('#')[0].trim();
  return {
    query,
    from: from - match[0].length,
    to: from,
  };
}

function renderSuggestions(container, items, onSelect) {
  container.innerHTML = '';

  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'wiki-suggest-empty';
    empty.textContent = '일치하는 노트가 없습니다.';
    container.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'wiki-suggest-item';
    const strong = document.createElement('strong');
    strong.textContent = item.title;
    const small = document.createElement('small');
    small.textContent = item.id;
    button.appendChild(strong);
    button.appendChild(small);
    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
      onSelect(item.id);
    });
    container.appendChild(button);
  });
}

function createAutocompletePopup(view, onSearch) {
  const popup = document.createElement('div');
  popup.className = 'wiki-suggest';
  popup.hidden = true;
  document.body.appendChild(popup);

  let activeMatch = null;
  let requestToken = 0;

  const hide = () => {
    popup.hidden = true;
    popup.innerHTML = '';
    activeMatch = null;
  };

  const selectSuggestion = (target) => {
    if (!activeMatch) return;
    const insertText = `[[${target.replace(/\.md$/, '')}]]`;
    view.dispatch(view.state.tr.insertText(insertText, activeMatch.from, activeMatch.to));
    hide();
  };

  const update = async (match) => {
    if (!onSearch) {
      hide();
      return;
    }
    if (!match) {
      hide();
      return;
    }

    activeMatch = match;
    const coords = view.coordsAtPos(match.to);
    popup.style.left = `${coords.left}px`;
    popup.style.top = `${coords.bottom + 8}px`;
    popup.hidden = false;

    const currentToken = requestToken + 1;
    requestToken = currentToken;
    const results = await onSearch(match.query);
    if (requestToken !== currentToken) return;
    renderSuggestions(popup, results, selectSuggestion);
  };

  return {
    update,
    hide,
    destroy() {
      popup.remove();
    },
  };
}

function createWikilinkPlugin({ onNavigate, onSearch }) {
  const key = new PluginKey('wikilink');

  return new Plugin({
    key,
    props: {
      decorations(state) {
        const decorations = [];
        const { doc } = state;

        doc.descendants((node, pos) => {
          if (!node.isText) return;
          const text = node.text || '';

          let match;
          WIKI_LINK_RE.lastIndex = 0;
          while ((match = WIKI_LINK_RE.exec(text)) !== null) {
            const [full, target] = match;
            const from = pos + match.index;
            const to = from + full.length;

            const deco = Decoration.inline(from, to, {
              class: 'wiki-link',
              'data-wiki-target': target.trim(),
              title: target.trim(),
              nodeName: 'span',
              contenteditable: 'true',
            });

            decorations.push(deco);
          }
        });

        return DecorationSet.create(state.doc, decorations);
      },

      handleDOMEvents: {
        click(view, event) {
          const target = event.target;
          if (!(target instanceof HTMLElement)) return false;

          const wikiEl = target.closest?.('[data-wiki-target]');
          if (!wikiEl) return false;

          const wikiTarget = wikiEl.getAttribute('data-wiki-target');
          if (!wikiTarget) return false;

          event.preventDefault();
          event.stopPropagation();

          onNavigate?.(wikiTarget, {
            newTab: event.metaKey || event.ctrlKey,
          });
          return true;
        },
      },
    },

    view(editorView) {
      const popup = createAutocompletePopup(editorView, onSearch);

      return {
        update(view, prevState) {
          if (prevState.doc.eq(view.state.doc) && prevState.selection.eq(view.state.selection)) {
            return;
          }
          const match = getAutocompleteMatch(view.state);
          void popup.update(match);
        },
        destroy() {
          popup.destroy();
        },
      };
    },
  });
}

export function wikilinkPlugin(options) {
  return $prose(() => createWikilinkPlugin(options));
}
