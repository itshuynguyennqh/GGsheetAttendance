import { createTheme } from '@mui/material/styles';

export const renaiTheme = createTheme({
  palette: {
    primary: {
      main: '#f6bd3c',
      dark: '#e8ad2a',
      light: '#fdf4dc',
    },
    secondary: {
      main: '#3d9b5c',
      light: '#e8f5ed',
    },
    background: {
      default: '#fffbf3',
      paper: '#ffffff',
    },
    text: {
      primary: 'rgba(30, 74, 110, 0.9)',
      secondary: 'rgba(30, 74, 110, 0.6)',
    },
  },
  typography: {
    fontFamily: '"Source Sans 3", "Segoe UI", sans-serif',
    h1: { fontFamily: '"Lora", Georgia, serif' },
    h2: { fontFamily: '"Lora", Georgia, serif' },
    h3: { fontFamily: '"Lora", Georgia, serif' },
  },
});
