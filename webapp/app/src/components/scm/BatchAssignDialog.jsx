import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Typography, Box, Stack, IconButton,
  Chip, Alert, List, ListItem, ListItemText, ListItemIcon,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import ErrorIcon from '@mui/icons-material/Error';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import { batchMatch } from '../../utils/fuzzyMatch';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';

function ConfidenceIcon({ score }) {
  if (score >= 0.8) return <CheckCircleIcon color="success" fontSize="small" />;
  if (score >= 0.5) return <WarningIcon color="warning" fontSize="small" />;
  return <ErrorIcon color="error" fontSize="small" />;
}

export default function BatchAssignDialog({
  open,
  selectedSeats = [],
  availableStudents = [],
  onConfirm,
  onClose,
}) {
  const [namesText, setNamesText] = useState('');
  const [preview, setPreview] = useState([]);

  const speech = useSpeechRecognition({
    lang: 'vi-VN',
    continuous: true,
    onResult: (fullTranscript) => {
      setNamesText(fullTranscript);
    },
  });

  useEffect(() => {
    if (open) {
      setNamesText('');
      setPreview([]);
      speech.setTranscript('');
    }
  }, [open]);

  const handleMatch = useCallback(() => {
    const names = namesText
      .split('\n')
      .map((n) => n.trim())
      .filter(Boolean);

    if (names.length === 0) return;

    const effectiveNames = names.slice(0, selectedSeats.length);
    const results = batchMatch(effectiveNames, availableStudents);
    setPreview(results);
  }, [namesText, selectedSeats, availableStudents]);

  const allMatched = useMemo(
    () => preview.length > 0 && preview.every((p) => p.match != null),
    [preview]
  );

  const handleConfirm = useCallback(() => {
    const assignments = preview
      .map((p, i) => {
        if (!p.match) return null;
        const seat = selectedSeats[i];
        if (!seat) return null;
        return {
          seatKey: `${seat.row}-${seat.col}`,
          studentId: p.match.student.id,
        };
      })
      .filter(Boolean);

    onConfirm?.(assignments);
    onClose?.();
  }, [preview, selectedSeats, onConfirm, onClose]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Gán tên hàng loạt ({selectedSeats.length} ghế)
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Nhập hoặc đọc tên học sinh, mỗi dòng một tên, theo thứ tự ghế đã chọn.
        </Typography>

        <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mb: 2 }}>
          <TextField
            label={`Nhập tên (${selectedSeats.length} dòng)`}
            multiline
            rows={Math.min(10, Math.max(4, selectedSeats.length))}
            fullWidth
            value={namesText}
            onChange={(e) => setNamesText(e.target.value)}
            placeholder={`Ví dụ:\nNguyễn Văn A\nTrần Thị B\nLê Văn C`}
          />
          {speech.supported && (
            <IconButton
              onClick={speech.toggle}
              color={speech.listening ? 'error' : 'primary'}
              sx={{
                mt: 1,
                width: 48,
                height: 48,
                bgcolor: speech.listening ? 'error.lighter' : 'primary.lighter',
                animation: speech.listening ? 'micPulse 1.5s ease-in-out infinite' : 'none',
                '@keyframes micPulse': {
                  '0%, 100%': { boxShadow: '0 0 0 0 rgba(211, 47, 47, 0.4)' },
                  '50%': { boxShadow: '0 0 0 8px rgba(211, 47, 47, 0)' },
                },
              }}
            >
              {speech.listening ? <MicOffIcon /> : <MicIcon />}
            </IconButton>
          )}
        </Stack>
        {speech.listening && speech.interimTranscript && (
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1, fontStyle: 'italic' }}>
            Đang nghe: {speech.interimTranscript}
          </Typography>
        )}

        <Button
          variant="outlined"
          onClick={handleMatch}
          disabled={!namesText.trim()}
          fullWidth
          sx={{ mb: 2 }}
        >
          Khớp tên
        </Button>

        {preview.length > 0 && (
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Kết quả khớp tên:
            </Typography>
            <List dense>
              {preview.map((p, i) => {
                const seat = selectedSeats[i];
                return (
                  <ListItem key={i} sx={{ bgcolor: p.match ? 'success.lighter' : 'error.lighter', borderRadius: 1, mb: 0.5 }}>
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      {p.match ? (
                        <ConfidenceIcon score={p.match.score} />
                      ) : (
                        <ErrorIcon color="error" fontSize="small" />
                      )}
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Chip
                            label={`Ghế ${i + 1}`}
                            size="small"
                            variant="outlined"
                            sx={{ fontSize: 11 }}
                          />
                          <Typography variant="body2">
                            {seat ? `R${seat.row + 1}C${seat.col + 1}` : ''}
                          </Typography>
                        </Stack>
                      }
                      secondary={
                        p.match ? (
                          <Typography variant="body2" component="span">
                            <strong>{p.name}</strong> → {p.match.student.hoTen || p.match.student.name}
                            {' '}
                            <Chip
                              label={`${Math.round(p.match.score * 100)}%`}
                              size="small"
                              color={p.match.score >= 0.8 ? 'success' : p.match.score >= 0.5 ? 'warning' : 'error'}
                              sx={{ height: 18, fontSize: 10 }}
                            />
                          </Typography>
                        ) : (
                          <Typography variant="body2" color="error" component="span">
                            <strong>{p.name}</strong> → Không tìm thấy
                          </Typography>
                        )
                      }
                    />
                  </ListItem>
                );
              })}
            </List>

            {!allMatched && (
              <Alert severity="warning" sx={{ mt: 1 }}>
                Có tên chưa khớp. Bạn vẫn có thể lưu các tên đã khớp.
              </Alert>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Hủy</Button>
        <Button
          variant="contained"
          onClick={handleConfirm}
          disabled={preview.length === 0 || !preview.some((p) => p.match)}
        >
          Gán ({preview.filter((p) => p.match).length} học sinh)
        </Button>
      </DialogActions>
    </Dialog>
  );
}
