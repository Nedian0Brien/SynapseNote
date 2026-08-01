import type { ElementJsxAttrs } from './jsx-component-view-utils';

type AttributePolicyProp = {
  hidden?: boolean;
  name: string;
  required?: boolean;
  type: string;
};

/** Derives the wrapper attributes that mirror descriptor policy, not user JSX. */
export function deriveJsxAttributePolicy({
  currentProps,
  isAlignable,
  props,
}: {
  currentProps: Record<string, unknown>;
  isAlignable: boolean;
  props: readonly AttributePolicyProp[];
}) {
  const rawAlign = currentProps.align;
  const dataAlign =
    rawAlign === 'left' || rawAlign === 'right' || rawAlign === 'center'
      ? rawAlign
      : isAlignable
        ? 'center'
        : undefined;
  const needsConfig = props.some(
    (prop) =>
      prop.type === 'string' &&
      prop.required === true &&
      prop.hidden !== true &&
      !Object.hasOwn(currentProps, prop.name),
  );
  return { dataAlign, needsConfig };
}

/** Creates the sole element-kind prop write shape used by NodeView editors. */
export function updateElementJsxProps(
  attrs: ElementJsxAttrs,
  propName: string,
  value: unknown,
): ElementJsxAttrs {
  const props = { ...attrs.props };
  const currentAttributes = Array.isArray(attrs.attributes) ? attrs.attributes : [];
  if (value === undefined) {
    delete props[propName];
    return {
      ...attrs,
      attributes: currentAttributes.filter(
        (attribute) =>
          !(
            attribute != null &&
            typeof attribute === 'object' &&
            (attribute as Record<string, unknown>).type === 'mdxJsxAttribute' &&
            (attribute as Record<string, unknown>).name === propName
          ),
      ),
      props,
      sourceDirty: true,
    } as ElementJsxAttrs;
  }
  props[propName] = value;
  return { ...attrs, props, sourceDirty: true };
}
