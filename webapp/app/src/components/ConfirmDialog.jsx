import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';

/**
 * Dialog xác nhận thiết kế theo theme website (thay cho confirm() của trình duyệt).
 * @param {boolean} open - Hiển thị/ẩn dialog
 * @param {function} onClose - Gọi khi đóng (Hủy hoặc click ngoài)
 * @param {function} onConfirm - Gọi khi bấm Xác nhận
 * @param {string} title - Tiêu đề (mặc định: "Xác nhận xóa")
 * @param {string} message - Nội dung câu hỏi
 * @param {string} [confirmLabel='Xác nhận'] - Nhãn nút xác nhận
 * @param {string} [confirmColor='error'] - Màu nút xác nhận: 'error' | 'primary'
 */
export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = 'Xác nhận xóa',
  message,
  confirmLabel = 'Xác nhận',
  confirmColor = 'error',
}) {
  const handleConfirm = () => {
    onConfirm?.();
    onClose?.();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2,
          boxShadow: '0 8px 32px rgba(30, 74, 110, 0.12)',
          border: '1px solid',
          borderColor: 'primary.light',
        },
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          fontFamily: 'Lora, serif',
          color: 'text.primary',
          pb: 0,
        }}
      >
        <DeleteOutlineIcon color="error" fontSize="medium" />
        {title}
      </DialogTitle>
      <DialogContent sx={{ pt: 1.5, pb: 0 }}>
        <Typography variant="body1" color="text.secondary">
          {message}
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
        <Button onClick={onClose} color="inherit" variant="outlined">
          Hủy
        </Button>
        <Button
          onClick={handleConfirm}
          color={confirmColor}
          variant="contained"
          autoFocus
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
