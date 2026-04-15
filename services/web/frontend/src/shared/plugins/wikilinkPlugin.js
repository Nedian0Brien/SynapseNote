/**
 * Milkdown 위키링크 플러그인
 *
 * [[문서제목]] 및 [[문서제목|표시텍스트]] 형태의 위키링크를
 * 클릭 가능한 링크로 렌더링합니다.
 *
 * ProseMirror Decoration 기반으로 구현:
 * - 마크다운 소스에는 [[...]] 그대로 저장 (round-trip 안전)
 * - 렌더링 시 .wiki-link 클래스 a 태그로 표시
 * - 클릭 시 onNavigate(target) 콜백 호출
 */
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import { $prose } from '@milkdown/kit/utils';

const WIKI_LINK_RE = /\[\[([^\]|#]+)(?:#[^\]|]*)?\|?([^\]]*)\]\]/g;

/**
 * 위키링크 ProseMirror 플러그인 생성
 * @param {(target: string) => void} onNavigate - 링크 클릭 시 호출
 */
function createWikilinkPlugin(onNavigate) {
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
              // 내용을 span 내부에 렌더링하기 위한 spec
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

          // .wiki-link 또는 부모가 .wiki-link인 경우
          const wikiEl = target.closest?.('[data-wiki-target]');
          if (!wikiEl) return false;

          const wikiTarget = wikiEl.getAttribute('data-wiki-target');
          if (!wikiTarget) return false;

          event.preventDefault();
          event.stopPropagation();

          if (onNavigate) onNavigate(wikiTarget);
          return true;
        },
      },
    },
  });
}

/**
 * Milkdown $prose 유틸리티로 감싼 위키링크 플러그인
 * @param {(target: string) => void} onNavigate
 */
export function wikilinkPlugin(onNavigate) {
  return $prose(() => createWikilinkPlugin(onNavigate));
}
