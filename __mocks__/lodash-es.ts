// Mock for lodash-es module
const isEqual = jest.fn((a: any, b: any) => {
  return true;
});

const debounce = jest.fn((func: Function, wait?: number) => {
  const debouncedFn = jest.fn((...args: any[]) => {
    return func(...args);
  });

  debouncedFn.cancel = jest.fn();
  debouncedFn.flush = jest.fn(() => func());

  return debouncedFn;
});

export default isEqual;
export { isEqual, debounce };
