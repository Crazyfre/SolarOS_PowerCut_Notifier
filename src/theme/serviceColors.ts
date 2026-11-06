import { darkTheme } from './dark';

// Keep headless notification code independent of the React provider tree.
export const serviceColors = {
  brand: darkTheme.colors.brand,
  success: darkTheme.colors.success,
  danger: darkTheme.colors.danger,
};
