import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  AppBar,
  Box,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import SchoolIcon from '@mui/icons-material/School';
import PeopleIcon from '@mui/icons-material/People';
import EventIcon from '@mui/icons-material/Event';
import AssignmentIcon from '@mui/icons-material/Assignment';
import DashboardIcon from '@mui/icons-material/Dashboard';
import SyncIcon from '@mui/icons-material/Sync';
import GradeIcon from '@mui/icons-material/Grade';
import EventSeatIcon from '@mui/icons-material/EventSeat';

const drawerWidth = 240;
const navItems = [
  { path: '/scm', label: 'Sơ đồ lớp', icon: <EventSeatIcon /> },
  { path: '/courses', label: 'Khóa học', icon: <SchoolIcon /> },
  { path: '/classes', label: 'Lớp học', icon: <SchoolIcon /> },
  { path: '/sessions', label: 'Ca học', icon: <EventIcon /> },
  { path: '/students', label: 'Học sinh', icon: <PeopleIcon /> },
  { path: '/attendance', label: 'Điểm danh', icon: <AssignmentIcon /> },
  { path: '/azota-exam-result', label: 'Điểm chấm Azota', icon: <GradeIcon /> },
  { path: '/dashboard', label: 'Dashboard', icon: <DashboardIcon /> },
  { path: '/azota', label: 'Quản lý Azota', icon: <SyncIcon /> },
];

export default function Layout({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  const drawer = (
    <>
      <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box
          component="img"
          src="/renai-logo.png"
          alt="Renai"
          sx={{ height: 40, flexShrink: 0 }}
        />
        <Box>
          <Typography variant="subtitle1" sx={{ fontFamily: 'Lora, Georgia, serif', fontWeight: 600, color: 'text.primary', lineHeight: 1.2 }}>
            Renai
          </Typography>
          <Typography variant="caption" display="block" sx={{ fontFamily: 'Lora, Georgia, serif', color: '#2e6b3a', lineHeight: 1.3 }}>
            Nurturing Renaissance Minds
          </Typography>
        </Box>
      </Box>
      <List sx={{ pt: 2 }}>
      {navItems.map((item) => (
        <ListItem key={item.path} disablePadding>
          <ListItemButton
            component={Link}
            to={item.path}
            selected={location.pathname === item.path}
            sx={{
              '&.Mui-selected': {
                bgcolor: 'primary.light',
                borderLeft: 3,
                borderColor: 'primary.main',
              },
            }}
          >
            <ListItemIcon>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} />
          </ListItemButton>
        </ListItem>
      ))}
    </List>
    </>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', width: '100%', flex: 1, minWidth: 0 }}>
      <AppBar
        position="fixed"
        sx={{
          width: { md: `calc(100% - ${drawerWidth}px)` },
          ml: { md: `${drawerWidth}px` },
          background: 'linear-gradient(135deg, #f8c95a 0%, #f6bd3c 100%)',
          color: '#2c5a7f',
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            edge="start"
            onClick={() => setMobileOpen(!mobileOpen)}
            sx={{ mr: 2, display: { md: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          <Box
            component="img"
            src="/renai-logo.png"
            alt="Renai"
            sx={{ height: 44, display: 'block', mr: 1.5 }}
          />
          <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <Typography variant="h6" noWrap sx={{ fontFamily: 'Lora, Georgia, serif', fontWeight: 600, color: '#1a3a52', lineHeight: 1.2 }}>
              Renai
            </Typography>
            <Typography variant="caption" sx={{ fontFamily: 'Lora, Georgia, serif', color: '#2e6b3a', lineHeight: 1.3 }}>
              Nurturing
              <br />
              Renaissance Minds
            </Typography>
          </Box>
        </Toolbar>
      </AppBar>
      <Box
        component="nav"
        sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', md: 'block' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: drawerWidth,
              top: 64,
              height: 'calc(100% - 64px)',
              borderRight: '1px solid rgba(246, 189, 60, 0.2)',
            },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>
      <Box
        component="main"
        sx={{
          flex: '1 1 0%',
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          alignSelf: 'stretch',
          p: 3,
          width: { xs: '100%', md: 'auto' },
          maxWidth: '100%',
          boxSizing: 'border-box',
          mt: 8,
          bgcolor: 'background.default',
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
