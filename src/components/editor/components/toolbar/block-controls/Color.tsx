import { Button, Divider } from '@mui/material';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSlateStatic } from 'slate-react';

import { YjsEditor } from '@/application/slate-yjs';
import { CustomEditor } from '@/application/slate-yjs/command';
import { SubscriptionPlan } from '@/application/types';
import { ColorTile, ColorTileIcon } from '@/components/_shared/color-picker';
import { Origins, Popover } from '@/components/_shared/popover';
import { BlockNode } from '@/components/editor/editor.type';
import { useEditorContext } from '@/components/editor/EditorContext';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ColorEnum, renderColor } from '@/utils/color';

const origins: Origins = {
  anchorOrigin: {
    vertical: 'top',
    horizontal: 'right',
  },
  transformOrigin: {
    vertical: 'top',
    horizontal: 'left',
  },
};

function Color({ node, onSelectColor }: { node: BlockNode; onSelectColor: () => void }) {
  const { getSubscriptions } = useEditorContext();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const { t } = useTranslation();
  const editor = useSlateStatic() as YjsEditor;
  const blockId = node.blockId;
  const [originalColor, setOriginalColor] = useState<string>(node.data?.bgColor || '');

  const [activeSubscriptionPlan, setActiveSubscriptionPlan] = useState<SubscriptionPlan | null>(null);
  const isPro = activeSubscriptionPlan === SubscriptionPlan.Pro;

  const loadSubscription = useCallback(async () => {
    try {
      const subscriptions = await getSubscriptions?.();

      if (!subscriptions || subscriptions.length === 0) {
        setActiveSubscriptionPlan(SubscriptionPlan.Free);
        return;
      }

      const subscription = subscriptions[0];

      setActiveSubscriptionPlan(subscription?.plan || SubscriptionPlan.Free);
    } catch (e) {
      setActiveSubscriptionPlan(SubscriptionPlan.Free);
      console.error(e);
    }
  }, [getSubscriptions]);

  useEffect(() => {
    void loadSubscription();
  }, [loadSubscription]);

  const builtinColors = useMemo(() => {
    return isPro
      ? [
          {
            color: '',
            label: t('colors.default'),
          },
          {
            color: ColorEnum.Tint1,
            label: t('colors.mauve'),
          },
          {
            color: ColorEnum.Tint11,
            label: t('colors.lavender'),
          },
          {
            color: ColorEnum.Tint2,
            label: t('colors.lilac'),
          },
          {
            color: ColorEnum.Tint12,
            label: t('colors.mallow'),
          },
          {
            color: ColorEnum.Tint3,
            label: t('colors.camellia'),
          },
          {
            color: ColorEnum.Tint13,
            label: t('colors.rose'),
          },
          {
            color: ColorEnum.Tint4,
            label: t('colors.papaya'),
          },
          {
            color: ColorEnum.Tint5,
            label: t('colors.mango'),
          },
          {
            color: ColorEnum.Tint14,
            label: t('colors.lemon'),
          },
          {
            color: ColorEnum.Tint6,
            label: t('colors.olive'),
          },
          {
            color: ColorEnum.Tint7,
            label: t('colors.grass'),
          },
          {
            color: ColorEnum.Tint8,
            label: t('colors.jade'),
          },
          {
            color: ColorEnum.Tint9,
            label: t('colors.azure'),
          },
          {
            color: ColorEnum.Tint10,
            label: t('colors.iron'),
          },
        ]
      : [
          {
            color: '',
            label: t('colors.default'),
          },
          {
            color: ColorEnum.Tint1,
            label: t('colors.mauve'),
          },
          {
            color: ColorEnum.Tint2,
            label: t('colors.lilac'),
          },
          {
            color: ColorEnum.Tint3,
            label: t('colors.camellia'),
          },
          {
            color: ColorEnum.Tint4,
            label: t('colors.papaya'),
          },
          {
            color: ColorEnum.Tint5,
            label: t('colors.mango'),
          },
          {
            color: ColorEnum.Tint6,
            label: t('colors.olive'),
          },
          {
            color: ColorEnum.Tint7,
            label: t('colors.grass'),
          },
          {
            color: ColorEnum.Tint8,
            label: t('colors.jade'),
          },
          {
            color: ColorEnum.Tint9,
            label: t('colors.azure'),
          },
        ];
  }, [isPro, t]);

  const icon = useMemo(() => {
    return <ColorTileIcon value={renderColor(originalColor || '')} />;
  }, [originalColor]);

  const handlePickColor = useCallback(
    (bgColor: string) => {
      if (bgColor === originalColor) {
        CustomEditor.setBlockData(editor, blockId, {
          bgColor: '',
        });
        return;
      }

      CustomEditor.setBlockData(editor, blockId, {
        bgColor,
      });

      setOriginalColor(bgColor);
    },
    [blockId, editor, originalColor]
  );

  return (
    <>
      <Divider />
      <Button
        ref={ref}
        startIcon={icon}
        size={'small'}
        color={'inherit'}
        className={'justify-start'}
        onClick={() => {
          setOpen(true);
        }}
      >
        {t('document.plugins.optionAction.color')}
      </Button>
      <Popover open={open} anchorEl={ref.current} onClose={() => setOpen(false)} {...origins}>
        <div className='flex w-[200px] flex-col py-1.5'>
          <div className={'px-3.5 pb-2 pt-1.5 text-xs font-medium text-text-tertiary'}>
            {t('editor.backgroundColor')}
          </div>
          <div className={'flex flex-wrap gap-2 px-3.5 pb-1.5'}>
            {builtinColors.map((color, index) => (
              <Tooltip key={index}>
                <TooltipContent>{color.label}</TooltipContent>
                <TooltipTrigger asChild>
                  <ColorTile
                    value={renderColor(color.color)}
                    active={originalColor === color.color}
                    onClick={() => {
                      handlePickColor(color.color);
                      setOpen(false);
                      onSelectColor();
                    }}
                  />
                </TooltipTrigger>
              </Tooltip>
            ))}
          </div>
        </div>
      </Popover>
    </>
  );
}

export default Color;
