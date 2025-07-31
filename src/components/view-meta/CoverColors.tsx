import { IconButton } from '@mui/material';
import { ColorEnum, colorMap } from '@/utils/color';

const colors = [
  [ColorEnum.Purple, colorMap[ColorEnum.Purple]],
  [ColorEnum.Pink, colorMap[ColorEnum.Pink]],
  [ColorEnum.LightPink, colorMap[ColorEnum.LightPink]],
  [ColorEnum.Orange, colorMap[ColorEnum.Orange]],
  [ColorEnum.Yellow, colorMap[ColorEnum.Yellow]],
  [ColorEnum.Lime, colorMap[ColorEnum.Lime]],
  [ColorEnum.Green, colorMap[ColorEnum.Green]],
  [ColorEnum.Aqua, colorMap[ColorEnum.Aqua]],
  [ColorEnum.Blue, colorMap[ColorEnum.Blue]],
];

function Colors ({ onDone }: { onDone?: (value: string) => void }) {
  return (
    <div className={'flex flex-wrap justify-center gap-2 p-2 pb-6'}>
      {colors.map(([name, value]) => (
        <IconButton
          key={name}
          className={'h-9 w-9 p-1 cursor-pointer rounded rounded-full'}
          onClick={() => onDone?.(name)}
        >
          <div
            style={{ backgroundColor: value }}
            className={'h-7 w-7 rounded rounded-full'}
          />
        </IconButton>
      ))}
    </div>
  );
}

export default Colors;
