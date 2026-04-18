import { Box, Typography, Fab, Tooltip } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import ClearIcon from '@mui/icons-material/Clear';

export default function PathSelectionOverlay({
  gridRef,
  selectedPath,
  isSelecting,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onConfirm,
  onCancel,
}) {
  return (
    <Box sx={{ position: 'relative' }}>
      <Box
        ref={gridRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        sx={{
          position: 'absolute',
          inset: 0,
          zIndex: 10,
          cursor: isSelecting ? 'crosshair' : 'cell',
          touchAction: 'none',
        }}
      />

      {selectedPath.length > 0 && (
        <Box
          sx={{
            position: 'absolute',
            bottom: -48,
            left: 0,
            right: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            zIndex: 20,
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Đã chọn: {selectedPath.length} ghế
          </Typography>
          <Tooltip title="Gán tên hàng loạt">
            <Fab size="small" color="primary" onClick={onConfirm}>
              <CheckIcon />
            </Fab>
          </Tooltip>
          <Tooltip title="Hủy chọn">
            <Fab size="small" color="default" onClick={onCancel}>
              <ClearIcon />
            </Fab>
          </Tooltip>
        </Box>
      )}
    </Box>
  );
}
