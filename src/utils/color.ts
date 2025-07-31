export enum ColorEnum {
  Purple = 'appflowy_them_color_tint1',
  Pink = 'appflowy_them_color_tint2',
  LightPink = 'appflowy_them_color_tint3',
  Orange = 'appflowy_them_color_tint4',
  Yellow = 'appflowy_them_color_tint5',
  Lime = 'appflowy_them_color_tint6',
  Green = 'appflowy_them_color_tint7',
  Aqua = 'appflowy_them_color_tint8',
  Blue = 'appflowy_them_color_tint9',
  DefaultText = 'text-default',
  DefaultBackground = 'bg-default',
  TextColor1 = 'text-color-1',
  TextColor2 = 'text-color-2',
  TextColor3 = 'text-color-3',
  TextColor4 = 'text-color-4',
  TextColor5 = 'text-color-5',
  TextColor6 = 'text-color-6',
  TextColor7 = 'text-color-7',
  TextColor8 = 'text-color-8',
  TextColor9 = 'text-color-9',
  TextColor10 = 'text-color-10',
  TextColor11 = 'text-color-11',
  TextColor12 = 'text-color-12',
  TextColor13 = 'text-color-13',
  TextColor14 = 'text-color-14',
  TextColor15 = 'text-color-15',
  TextColor16 = 'text-color-16',
  TextColor17 = 'text-color-17',
  TextColor18 = 'text-color-18',
  TextColor19 = 'text-color-19',
  TextColor20 = 'text-color-20',
  BgColor1 = 'bg-color-1',
  BgColor2 = 'bg-color-2',
  BgColor3 = 'bg-color-3',
  BgColor4 = 'bg-color-4',
  BgColor5 = 'bg-color-5',
  BgColor6 = 'bg-color-6',
  BgColor7 = 'bg-color-7',
  BgColor8 = 'bg-color-8',
  BgColor9 = 'bg-color-9',
  BgColor10 = 'bg-color-10',
  BgColor11 = 'bg-color-11',
  BgColor12 = 'bg-color-12',
  BgColor13 = 'bg-color-13',
  BgColor14 = 'bg-color-14',
  BgColor15 = 'bg-color-15',
  BgColor16 = 'bg-color-16',
  BgColor17 = 'bg-color-17',
  BgColor18 = 'bg-color-18',
  BgColor19 = 'bg-color-19',
  BgColor20 = 'bg-color-20',
}

export enum GradientEnum {
  gradient1 = 'appflowy_them_color_gradient1',
  gradient2 = 'appflowy_them_color_gradient2',
  gradient3 = 'appflowy_them_color_gradient3',
  gradient4 = 'appflowy_them_color_gradient4',
  gradient5 = 'appflowy_them_color_gradient5',
  gradient6 = 'appflowy_them_color_gradient6',
  gradient7 = 'appflowy_them_color_gradient7',
}

export const colorMap = {
  [ColorEnum.Purple]: 'var(--tint-purple)',
  [ColorEnum.Pink]: 'var(--tint-pink)',
  [ColorEnum.LightPink]: 'var(--tint-red)',
  [ColorEnum.Orange]: 'var(--tint-orange)',
  [ColorEnum.Yellow]: 'var(--tint-yellow)',
  [ColorEnum.Lime]: 'var(--tint-lime)',
  [ColorEnum.Green]: 'var(--tint-green)',
  [ColorEnum.Aqua]: 'var(--tint-aqua)',
  [ColorEnum.Blue]: 'var(--tint-blue)',
  [ColorEnum.DefaultText]: 'var(--text-primary)',
  [ColorEnum.DefaultBackground]: '',
  [ColorEnum.TextColor1]: 'var(--palette-text-color-1)',
  [ColorEnum.TextColor2]: 'var(--palette-text-color-2)',
  [ColorEnum.TextColor3]: 'var(--palette-text-color-3)',
  [ColorEnum.TextColor4]: 'var(--palette-text-color-4)',
  [ColorEnum.TextColor5]: 'var(--palette-text-color-5)',
  [ColorEnum.TextColor6]: 'var(--palette-text-color-6)',
  [ColorEnum.TextColor7]: 'var(--palette-text-color-7)',
  [ColorEnum.TextColor8]: 'var(--palette-text-color-8)',
  [ColorEnum.TextColor9]: 'var(--palette-text-color-9)',
  [ColorEnum.TextColor10]: 'var(--palette-text-color-10)',
  [ColorEnum.TextColor11]: 'var(--palette-text-color-11)',
  [ColorEnum.TextColor12]: 'var(--palette-text-color-12)',
  [ColorEnum.TextColor13]: 'var(--palette-text-color-13)',
  [ColorEnum.TextColor14]: 'var(--palette-text-color-14)',
  [ColorEnum.TextColor15]: 'var(--palette-text-color-15)',
  [ColorEnum.TextColor16]: 'var(--palette-text-color-16)',
  [ColorEnum.TextColor17]: 'var(--palette-text-color-17)',
  [ColorEnum.TextColor18]: 'var(--palette-text-color-18)',
  [ColorEnum.TextColor19]: 'var(--palette-text-color-19)',
  [ColorEnum.TextColor20]: 'var(--palette-text-color-20)',
  [ColorEnum.BgColor1]: 'var(--palette-bg-color-1)',
  [ColorEnum.BgColor2]: 'var(--palette-bg-color-2)',
  [ColorEnum.BgColor3]: 'var(--palette-bg-color-3)',
  [ColorEnum.BgColor4]: 'var(--palette-bg-color-4)',
  [ColorEnum.BgColor5]: 'var(--palette-bg-color-5)',
  [ColorEnum.BgColor6]: 'var(--palette-bg-color-6)',
  [ColorEnum.BgColor7]: 'var(--palette-bg-color-7)',
  [ColorEnum.BgColor8]: 'var(--palette-bg-color-8)',
  [ColorEnum.BgColor9]: 'var(--palette-bg-color-9)',
  [ColorEnum.BgColor10]: 'var(--palette-bg-color-10)',
  [ColorEnum.BgColor11]: 'var(--palette-bg-color-11)',
  [ColorEnum.BgColor12]: 'var(--palette-bg-color-12)',
  [ColorEnum.BgColor13]: 'var(--palette-bg-color-13)',
  [ColorEnum.BgColor14]: 'var(--palette-bg-color-14)',
  [ColorEnum.BgColor15]: 'var(--palette-bg-color-15)',
  [ColorEnum.BgColor16]: 'var(--palette-bg-color-16)',
  [ColorEnum.BgColor17]: 'var(--palette-bg-color-17)',
  [ColorEnum.BgColor18]: 'var(--palette-bg-color-18)',
  [ColorEnum.BgColor19]: 'var(--palette-bg-color-19)',
  [ColorEnum.BgColor20]: 'var(--palette-bg-color-20)',
};

export const gradientMap = {
  [GradientEnum.gradient1]: 'var(--gradient1)',
  [GradientEnum.gradient2]: 'var(--gradient2)',
  [GradientEnum.gradient3]: 'var(--gradient3)',
  [GradientEnum.gradient4]: 'var(--gradient4)',
  [GradientEnum.gradient5]: 'var(--gradient5)',
  [GradientEnum.gradient6]: 'var(--gradient6)',
  [GradientEnum.gradient7]: 'var(--gradient7)',
};

// Convert ARGB to RGBA
// Flutter uses ARGB, but CSS uses RGBA
function argbToRgba(color: string): string {
  if (!color) {
    return '';
  }

  const hex = color.replace(/^#|0x/, '');

  const hasAlpha = hex.length === 8;

  if (!hasAlpha) {
    return color.replace('0x', '#');
  }

  const r = parseInt(hex.slice(2, 4), 16);
  const g = parseInt(hex.slice(4, 6), 16);
  const b = parseInt(hex.slice(6, 8), 16);
  const a = hasAlpha ? parseInt(hex.slice(0, 2), 16) / 255 : 1;

  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function renderColor(color: string) {
  if (colorMap[color as ColorEnum]) {
    return colorMap[color as ColorEnum];
  }

  if (gradientMap[color as GradientEnum]) {
    return gradientMap[color as GradientEnum];
  }

  return argbToRgba(color);
}

export function stringToColor(string: string, colorArray?: string[]) {
  let hash = 0;
  let i;

  /* eslint-disable no-bitwise */
  for (i = 0; i < string.length; i += 1) {
    hash = string.charCodeAt(i) + ((hash << 5) - hash);
  }

  if (colorArray) {
    return colorArray[string.slice(0, 1).charCodeAt(0) % colorArray.length];
  }

  let color = '#';

  for (i = 0; i < 3; i += 1) {
    const value = (hash >> (i * 8)) & 0xff;

    color += `00${value.toString(16)}`.slice(-2);
  }
  /* eslint-enable no-bitwise */

  return color;
}

const colorDefaultArray: string[] = [
  '#5287D8',
  '#6E9DE3',
  '#8BB3ED',
  '#A7C9F7',
  '#979EB6',
  '#A2A8BF',
  '#ACB2C8',
  '#C1C7DA',
  '#E8AF53',
  '#E6C25A',
  '#E6D26F',
  '#E6E288',
  '#589599',
  '#68AD8E',
  '#79C47F',
  '#8CDB6A',
  '#AA94DC',
  '#C49EEB',
  '#BAACEE',
  '#D5C4FB',
  '#F597D2',
  '#FCB2E3',
  '#FDC5E8',
  '#F8D2E1',
  '#D1D269',
  '#C7C98D',
  '#CED09B',
  '#DAD9B6',
  '#DDD2C6',
  '#DDD6C7',
  '#EADED3',
  '#FED5C4',
  '#72A7D8',
  '#8FCAE3',
  '#64B3DA',
  '#52B2D4',
  '#90A4FF',
  '#A8BEF4',
  '#AEBDFF',
  '#C2CDFF',
  '#86C1B7',
  '#A6D8D0',
  '#A7D7A8',
  '#C8E4C9',
  '#FF9494',
  '#FFBDBD',
  '#DCA8A8',
  '#E3C4C4',
];

export function stringAvatar(name: string, colorArray: string[] = colorDefaultArray) {
  if (!name) {
    return null;
  }

  return {
    sx: {
      bgcolor: stringToColor(name, colorArray),
    },
    children: `${name.split('')[0]}`,
  };
}

export const IconColors = [
  '0xFFA34AFD',
  '0xFFFB006D',
  '0xFF00C8FF',
  '0xFFFFBA00',
  '0xFFF254BC',
  '0xFF2AC985',
  '0xFFAAD93D',
  '0xFF535CE4',
  '0xFF808080',
  '0xFFD2515F',
  '0xFF409BF8',
  '0xFFFF8933',
];

export function randomColor(colors: string[]): string {
  return colors[Math.floor(Math.random() * colors.length)];
}
