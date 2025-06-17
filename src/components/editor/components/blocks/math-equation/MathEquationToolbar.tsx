import { ReactComponent as CopyIcon } from '@/assets/icons/copy.svg';
import ActionButton from '@/components/editor/components/toolbar/selection-toolbar/actions/ActionButton';
import { MathEquationNode } from '@/components/editor/editor.type';
import { notify } from '@/components/_shared/notify';
import { copyTextToClipboard } from '@/utils/copy';
import { useTranslation } from 'react-i18next';

function MathEquationToolbar({ node }: { node: MathEquationNode }) {
  const { t } = useTranslation();
  const formula = node.data.formula || '';

  const onCopy = async () => {
    await copyTextToClipboard(formula);
    notify.success(t('publish.copy.mathBlock'));
  };

  return (
    <div contentEditable={false} onClick={(e) => e.stopPropagation()} className={'absolute right-1 top-2 z-10'}>
      <div className={'flex space-x-1 rounded-[8px] border border-border-primary bg-fill-toolbar p-1 shadow '}>
        <ActionButton onClick={onCopy} tooltip={t('editor.copy')}>
          <CopyIcon />
        </ActionButton>
      </div>
    </div>
  );
}

export default MathEquationToolbar;
