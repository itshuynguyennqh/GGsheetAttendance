import { useState, useCallback, useRef, memo } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Typography, Box, Stack, Chip, Alert,
  CircularProgress, IconButton, Tooltip, Stepper, Step, StepLabel,
  List, ListItem, ListItemIcon, ListItemText, Select, MenuItem,
} from '@mui/material';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import ImageIcon from '@mui/icons-material/Image';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import ErrorIcon from '@mui/icons-material/Error';
import ReplayIcon from '@mui/icons-material/Replay';
import { imageOcrApi } from '../../api';
import { findBestMatch } from '../../utils/fuzzyMatch';

const STEPS = ['Chụp / Tải ảnh', 'AI nhận diện', 'Xác minh & Gán'];

function ConfidenceChip({ score }) {
  const pct = Math.round(score * 100);
  const color = score >= 0.8 ? 'success' : score >= 0.5 ? 'warning' : 'error';
  return <Chip label={`${pct}%`} size="small" color={color} sx={{ height: 20, fontSize: 10 }} />;
}

function ImageImportDialog({
  open,
  onClose,
  allStudents = [],
  gridRows,
  gridCols,
  onConfirm,
}) {
  const [step, setStep] = useState(0);
  const [imageData, setImageData] = useState(null);
  const [mimeType, setMimeType] = useState('image/jpeg');
  const [ocrResult, setOcrResult] = useState(null);
  const [matchResults, setMatchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const reset = useCallback(() => {
    setStep(0);
    setImageData(null);
    setOcrResult(null);
    setMatchResults([]);
    setLoading(false);
    setError('');
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose?.();
  }, [onClose, reset]);

  const processFile = useCallback((file) => {
    if (!file) return;
    setError('');
    const reader = new FileReader();
    reader.onload = (e) => {
      setImageData(e.target.result);
      setMimeType(file.type || 'image/jpeg');
      setStep(1);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleFileSelect = useCallback((e) => {
    processFile(e.target.files?.[0]);
  }, [processFile]);

  const handleCameraCapture = useCallback((e) => {
    processFile(e.target.files?.[0]);
  }, [processFile]);

  const handleOcr = useCallback(async () => {
    if (!imageData) return;
    setLoading(true);
    setError('');
    try {
      const result = await imageOcrApi.recognizeSeatingChart(imageData, mimeType);
      setOcrResult(result);

      const matched = (result.cells || []).map((cell) => {
        const match = findBestMatch(cell.name, allStudents, 0.35);
        return { ...cell, match };
      });

      const extras = (result.extras || []).map((ex) => {
        const match = findBestMatch(ex.name, allStudents, 0.35);
        return { ...ex, match, isExtra: true };
      });

      setMatchResults([...matched, ...extras]);
      setStep(2);
    } catch (err) {
      setError(err.message || 'Lỗi khi gọi AI nhận diện');
    } finally {
      setLoading(false);
    }
  }, [imageData, mimeType, allStudents]);

  const handleManualMatch = useCallback((idx, studentId) => {
    setMatchResults((prev) => {
      const next = [...prev];
      if (studentId) {
        const student = allStudents.find((s) => s.id === studentId);
        next[idx] = { ...next[idx], match: student ? { student, score: 1 } : null };
      } else {
        next[idx] = { ...next[idx], match: null };
      }
      return next;
    });
  }, [allStudents]);

  const handleConfirm = useCallback(() => {
    const assignments = matchResults
      .filter((m) => m.match && !m.isExtra && m.row != null && m.col != null)
      .map((m) => ({
        seatKey: `${m.row}-${m.col}`,
        studentId: m.match.student.id,
      }));
    onConfirm?.(assignments);
    handleClose();
  }, [matchResults, onConfirm, handleClose]);

  const matchedCount = matchResults.filter((m) => m.match && !m.isExtra).length;
  const totalCells = matchResults.filter((m) => !m.isExtra).length;
  const usedStudentIds = new Set(matchResults.filter((m) => m.match).map((m) => m.match.student.id));

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <span>Nhập sơ đồ từ ảnh viết tay</span>
          {step > 0 && (
            <Tooltip title="Làm lại">
              <IconButton size="small" onClick={reset}>
                <ReplayIcon />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      </DialogTitle>

      <DialogContent>
        <Stepper activeStep={step} sx={{ mb: 3 }} alternativeLabel>
          {STEPS.map((label) => (
            <Step key={label}><StepLabel>{label}</StepLabel></Step>
          ))}
        </Stepper>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {step === 0 && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography variant="body1" sx={{ mb: 3 }}>
              Chụp ảnh hoặc tải lên sơ đồ chỗ ngồi viết tay
            </Typography>
            <Stack direction="row" spacing={2} justifyContent="center">
              <Button
                variant="outlined"
                size="large"
                startIcon={<CameraAltIcon />}
                onClick={() => cameraInputRef.current?.click()}
                sx={{ minHeight: 56, px: 4 }}
              >
                Chụp ảnh
              </Button>
              <Button
                variant="outlined"
                size="large"
                startIcon={<ImageIcon />}
                onClick={() => fileInputRef.current?.click()}
                sx={{ minHeight: 56, px: 4 }}
              >
                Chọn ảnh
              </Button>
            </Stack>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={handleCameraCapture}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={handleFileSelect}
            />
            <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
              Hỗ trợ ảnh viết tay dạng bảng/lưới. AI sẽ đọc tên và vị trí.
            </Typography>
          </Box>
        )}

        {step === 1 && (
          <Box>
            <Box
              sx={{
                mb: 2, borderRadius: 2, overflow: 'hidden',
                border: '1px solid', borderColor: 'grey.300',
                maxHeight: 400, display: 'flex', justifyContent: 'center',
                bgcolor: 'grey.50',
              }}
            >
              <Box
                component="img"
                src={imageData}
                alt="Ảnh sơ đồ"
                sx={{ maxWidth: '100%', maxHeight: 400, objectFit: 'contain' }}
              />
            </Box>
            <Box sx={{ textAlign: 'center' }}>
              <Button
                variant="contained"
                size="large"
                onClick={handleOcr}
                disabled={loading}
                startIcon={loading ? <CircularProgress size={20} color="inherit" /> : null}
                sx={{ minHeight: 48, px: 6 }}
              >
                {loading ? 'Đang nhận diện...' : 'Gửi AI nhận diện'}
              </Button>
            </Box>
            {loading && (
              <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', display: 'block', mt: 1 }}>
                Gemini đang phân tích ảnh, vui lòng chờ...
              </Typography>
            )}
          </Box>
        )}

        {step === 2 && (
          <Box>
            <Stack direction="row" spacing={2} sx={{ mb: 2 }} alignItems="center">
              <Chip
                label={`${matchedCount}/${totalCells} đã khớp`}
                color={matchedCount === totalCells ? 'success' : 'warning'}
                sx={{ fontWeight: 600 }}
              />
              {ocrResult?.rows && ocrResult?.cols && (
                <Typography variant="body2" color="text.secondary">
                  Bảng {ocrResult.rows} x {ocrResult.cols}
                  {ocrResult._durationMs && ` · ${ocrResult._durationMs}ms`}
                </Typography>
              )}
            </Stack>

            {imageData && (
              <Box
                sx={{
                  mb: 2, borderRadius: 1, overflow: 'hidden',
                  border: '1px solid', borderColor: 'grey.200',
                  maxHeight: 200, display: 'flex', justifyContent: 'center',
                  bgcolor: 'grey.50',
                }}
              >
                <Box
                  component="img"
                  src={imageData}
                  alt="Ảnh gốc"
                  sx={{ maxWidth: '100%', maxHeight: 200, objectFit: 'contain' }}
                />
              </Box>
            )}

            <List dense sx={{ maxHeight: 350, overflow: 'auto' }}>
              {matchResults.map((item, idx) => (
                <ListItem
                  key={idx}
                  sx={{
                    bgcolor: item.match
                      ? (item.match.score >= 0.8 ? 'success.50' : 'warning.50')
                      : 'error.50',
                    borderRadius: 1, mb: 0.5,
                    flexWrap: 'wrap',
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    {item.match ? (
                      item.match.score >= 0.8 ? <CheckCircleIcon color="success" fontSize="small" />
                        : <WarningIcon color="warning" fontSize="small" />
                    ) : (
                      <ErrorIcon color="error" fontSize="small" />
                    )}
                  </ListItemIcon>
                  <ListItemText
                    sx={{ minWidth: 0, flex: 1 }}
                    primary={
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                        {item.isExtra ? (
                          <Chip label={item.note || 'Ngoài bảng'} size="small" variant="outlined" color="info" />
                        ) : (
                          <Chip label={`R${item.row + 1}C${item.col + 1}`} size="small" variant="outlined" sx={{ fontSize: 11 }} />
                        )}
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          "{item.name}"
                        </Typography>
                        {item.match && (
                          <>
                            <Typography variant="body2">→</Typography>
                            <Typography variant="body2" color="primary.main" sx={{ fontWeight: 600 }}>
                              {item.match.student.hoTen || item.match.student.name}
                            </Typography>
                            <ConfidenceChip score={item.match.score} />
                          </>
                        )}
                      </Stack>
                    }
                  />
                  <Select
                    size="small"
                    value={item.match?.student?.id || ''}
                    onChange={(e) => handleManualMatch(idx, e.target.value || null)}
                    displayEmpty
                    sx={{ minWidth: 150, fontSize: 12, ml: 1 }}
                  >
                    <MenuItem value="">
                      <em>Chọn thủ công</em>
                    </MenuItem>
                    {allStudents.map((s) => (
                      <MenuItem
                        key={s.id}
                        value={s.id}
                        disabled={usedStudentIds.has(s.id) && item.match?.student?.id !== s.id}
                      >
                        {s.hoTen || s.name}
                      </MenuItem>
                    ))}
                  </Select>
                </ListItem>
              ))}
            </List>

            {matchResults.some((m) => m.isExtra && m.match) && (
              <Alert severity="info" sx={{ mt: 1 }}>
                Học sinh ngoài bảng (muộn, ghi chú) sẽ không được gán ghế tự động.
              </Alert>
            )}
          </Box>
        )}

        {ocrResult?.meta && (ocrResult.meta.class || ocrResult.meta.date) && (
          <Alert severity="info" sx={{ mt: 1 }} icon={false}>
            {ocrResult.meta.class && <span>Lớp: <strong>{ocrResult.meta.class}</strong></span>}
            {ocrResult.meta.class && ocrResult.meta.date && ' · '}
            {ocrResult.meta.date && <span>Ngày: <strong>{ocrResult.meta.date}</strong></span>}
          </Alert>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose}>Hủy</Button>
        {step === 2 && (
          <Button
            variant="contained"
            onClick={handleConfirm}
            disabled={matchedCount === 0}
          >
            Gán {matchedCount} chỗ ngồi
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

export default memo(ImageImportDialog);
