import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  IconButton,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  LinearProgress,
  Alert,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DownloadIcon from '@mui/icons-material/Download';
import { classesApi, studentsApi } from '../api';
import ConfirmDialog from '../components/ConfirmDialog';
import * as XLSX from 'xlsx';

export default function Students() {
  const [list, setList] = useState([]);
  const [classes, setClasses] = useState([]);
  const [classFilter, setClassFilter] = useState('');
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, id: null });
  const [importOpen, setImportOpen] = useState(false);
  const [importData, setImportData] = useState([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [form, setForm] = useState({
    maHV: '', hoTen: '', ten: '', classId: '', status: 'đi học',
    namSinh: '', soDTRieng: '', soDTPhuHuynh: '', tenPhuHuynh: '', diaChi: '', gioiTinh: '',
  });

  const load = async () => {
    try {
      const [studentsData, classesData] = await Promise.all([
        studentsApi.list(classFilter ? { classId: classFilter } : {}),
        classesApi.list(),
      ]);
      setList(studentsData);
      setClasses(classesData);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => { load(); }, [classFilter]);

  const handleOpen = (row = null) => {
    if (row) {
      setEditId(row.id);
      setForm({
        maHV: row.maHV,
        hoTen: row.hoTen,
        ten: row.ten || '',
        classId: row.classId,
        status: row.status || 'đi học',
        namSinh: row.namSinh || '',
        soDTRieng: row.soDTRieng || '',
        soDTPhuHuynh: row.soDTPhuHuynh || '',
        tenPhuHuynh: row.tenPhuHuynh || '',
        diaChi: row.diaChi || '',
        gioiTinh: row.gioiTinh || '',
      });
    } else {
      setEditId(null);
      setForm({
        maHV: '', hoTen: '', ten: '', classId: classes[0]?.id || '', status: 'đi học',
        namSinh: '', soDTRieng: '', soDTPhuHuynh: '', tenPhuHuynh: '', diaChi: '', gioiTinh: '',
      });
    }
    setOpen(true);
  };

  const handleSave = async () => {
    try {
      const payload = { ...form, addToAzota: false };
      if (editId) {
        await studentsApi.update(editId, payload);
      } else {
        await studentsApi.create(payload);
      }
      // Clear cache to ensure fresh data
      studentsApi.clearCache();
      classesApi.clearCache();
      setOpen(false);
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  const handleDeleteClick = (id) => setDeleteConfirm({ open: true, id });

  const handleDeleteConfirm = async () => {
    const id = deleteConfirm.id;
    if (!id) return;
    try {
      await studentsApi.delete(id);
      // Clear cache to ensure fresh data
      studentsApi.clearCache();
      classesApi.clearCache();
      setDeleteConfirm({ open: false, id: null });
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (classes.length === 0) {
      alert('Vui lòng đợi danh sách lớp được tải xong trước khi import');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

        if (jsonData.length < 2) {
          alert('File Excel phải có ít nhất 1 dòng dữ liệu (không tính header)');
          return;
        }

        // Parse header row
        const headers = jsonData[0].map(h => String(h || '').trim().toLowerCase());
        
        // Map column names to field names
        const fieldMap = {
          'mã hv': 'maHV',
          'mã học viên': 'maHV',
          'ma hv': 'maHV',
          'ma hoc vien': 'maHV',
          'họ tên': 'hoTen',
          'ho ten': 'hoTen',
          'họ và tên': 'hoTen',
          'ho va ten': 'hoTen',
          'tên': 'ten',
          'ten': 'ten',
          'tên gọi': 'ten',
          'ten goi': 'ten',
          'lớp': 'classId',
          'lop': 'classId',
          'class': 'classId',
          'tình trạng': 'status',
          'tinh trang': 'status',
          'status': 'status',
          'năm sinh': 'namSinh',
          'nam sinh': 'namSinh',
          'sđt riêng': 'soDTRieng',
          'sdt rieng': 'soDTRieng',
          'số điện thoại': 'soDTRieng',
          'so dien thoai': 'soDTRieng',
          'sđt phụ huynh': 'soDTPhuHuynh',
          'sdt phu huynh': 'soDTPhuHuynh',
          'sđt ph': 'soDTPhuHuynh',
          'sdt ph': 'soDTPhuHuynh',
          'tên phụ huynh': 'tenPhuHuynh',
          'ten phu huynh': 'tenPhuHuynh',
          'phụ huynh': 'tenPhuHuynh',
          'phu huynh': 'tenPhuHuynh',
          'địa chỉ': 'diaChi',
          'dia chi': 'diaChi',
          'address': 'diaChi',
          'giới tính': 'gioiTinh',
          'gioi tinh': 'gioiTinh',
          'gender': 'gioiTinh',
        };

        // Parse data rows
        const parsed = [];
        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          
          // Skip empty rows (all cells are empty or whitespace)
          const isEmptyRow = !row || row.every(cell => {
            const val = cell !== undefined && cell !== null ? String(cell).trim() : '';
            return val === '';
          });
          
          if (isEmptyRow) {
            continue; // Skip empty rows
          }
          
          const student = {};
          
          headers.forEach((header, idx) => {
            const field = fieldMap[header];
            if (field) {
              let value = row[idx];
              if (value !== undefined && value !== null) {
                value = String(value).trim();
                if (value) {
                  student[field] = value;
                }
              }
            }
          });

          // Validate required fields - both maHV and hoTen are required
          const maHV = (student.maHV || '').trim();
          const hoTen = (student.hoTen || '').trim();
          
          // Skip if missing required fields
          if (!maHV || !hoTen) {
            continue; // Skip rows without required fields
          }
          
          // Update student object with trimmed values
          student.maHV = maHV;
          student.hoTen = hoTen;

          // Map class name to classId
          let matchedClassId = null;
          if (student.classId) {
            const classValue = String(student.classId).trim();
            student._originalClassName = classValue; // Keep original for error display
            
            // First try to match by ID (if it's a number)
            if (!isNaN(classValue) && classValue !== '') {
              const matchedById = classes.find(c => String(c.id) === classValue);
              if (matchedById) {
                matchedClassId = matchedById.id;
              }
            }
            
            // If not found by ID, try to find by name (case insensitive, exact or partial match)
            if (!matchedClassId) {
              const matchedClass = classes.find(c => {
                const className = c.name.toLowerCase().trim();
                const searchValue = classValue.toLowerCase();
                // Exact match first
                if (className === searchValue) return true;
                // Then try partial match (remove spaces and special chars)
                const normalize = (str) => str.replace(/\s+/g, '').replace(/[._-]/g, '');
                if (normalize(className) === normalize(searchValue)) return true;
                // Try contains
                if (className.includes(searchValue) || searchValue.includes(className)) return true;
                return false;
              });
              
              if (matchedClass) {
                matchedClassId = matchedClass.id;
              }
            }
          }

          // Set classId
          if (matchedClassId) {
            student.classId = matchedClassId;
          } else if (classes.length > 0) {
            // Use first class as default if not found
            student.classId = classes[0].id;
            student._usedDefaultClass = true;
          } else {
            // No classes available
            student.classId = null;
          }

          // Add to parsed array (we already checked for maHV or hoTen above)
          parsed.push(student);
        }

        if (parsed.length === 0) {
          alert('Không tìm thấy dữ liệu hợp lệ trong file Excel');
          return;
        }

        setImportData(parsed);
        setImportOpen(true);
        setImportResult(null);
      } catch (error) {
        alert('Lỗi đọc file Excel: ' + error.message);
      }
    };
    reader.readAsArrayBuffer(file);
    event.target.value = ''; // Reset file input
  };

  const handleImport = async () => {
    if (importData.length === 0) return;
    
    setImportLoading(true);
    setImportResult(null);
    
    try {
      const result = await studentsApi.bulkImport({ students: importData });
      setImportResult(result);
      if (result.success.length > 0) {
        // Clear cache to ensure fresh data
        studentsApi.clearCache();
        classesApi.clearCache();
        load(); // Reload list
      }
    } catch (e) {
      const msg = e.message || '';
      const friendlyMessage =
        msg.includes('Failed to fetch') || msg.includes('NetworkError')
          ? 'Không kết nối được máy chủ. Kiểm tra mạng hoặc thử lại sau.'
          : msg.includes('500') || msg.includes('Internal Server')
            ? 'Lỗi máy chủ. Vui lòng thử lại sau.'
            : msg || 'Đã xảy ra lỗi khi import.';
      setImportResult({
        success: [],
        errors: [{ index: '—', maHV: '—', hoTen: '—', error: friendlyMessage }],
      });
    } finally {
      setImportLoading(false);
    }
  };

  const handleCloseImport = () => {
    setImportOpen(false);
    setImportData([]);
    setImportResult(null);
  };

  const handleDownloadTemplate = () => {
    // Tạo dữ liệu mẫu
    const templateData = [
      ['Mã HV', 'Họ tên', 'Tên gọi', 'Lớp', 'Tình trạng', 'Năm sinh', 'SĐT riêng', 'SĐT phụ huynh', 'Tên phụ huynh', 'Địa chỉ', 'Giới tính'],
      ['HV001', 'Nguyễn Văn A', 'A', classes[0]?.name || 'Lớp 1', 'đi học', '2010', '0123456789', '0987654321', 'Nguyễn Văn B', '123 Đường ABC', 'Nam'],
      ['HV002', 'Trần Thị B', 'B', classes[0]?.name || 'Lớp 1', 'đi học', '2011', '', '0987654322', 'Trần Thị C', '456 Đường XYZ', 'Nữ'],
    ];

    // Tạo workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(templateData);
    
    // Set column widths
    ws['!cols'] = [
      { wch: 10 }, // Mã HV
      { wch: 20 }, // Họ tên
      { wch: 12 }, // Tên gọi
      { wch: 15 }, // Lớp
      { wch: 12 }, // Tình trạng
      { wch: 10 }, // Năm sinh
      { wch: 15 }, // SĐT riêng
      { wch: 15 }, // SĐT phụ huynh
      { wch: 20 }, // Tên phụ huynh
      { wch: 30 }, // Địa chỉ
      { wch: 10 }, // Giới tính
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Học sinh');
    
    // Download file
    XLSX.writeFile(wb, 'Mau_Import_Hoc_Sinh.xlsx');
  };

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2, fontFamily: 'Lora, serif' }}>
        Học sinh
      </Typography>
      <Box sx={{ mb: 2, display: 'flex', gap: 2, alignItems: 'center' }}>
        <FormControl sx={{ minWidth: 140 }}>
          <InputLabel>Lớp</InputLabel>
          <Select value={classFilter} label="Lớp" onChange={(e) => setClassFilter(e.target.value)}>
            <MenuItem value="">Tất cả</MenuItem>
            {classes.map((c) => (
              <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpen()} disabled={classes.length === 0}>
          Thêm học sinh
        </Button>
        <Button 
          variant="outlined" 
          startIcon={<UploadFileIcon />} 
          onClick={() => {
            setImportOpen(true);
            setImportData([]);
            setImportResult(null);
          }}
          disabled={classes.length === 0}
        >
          Import Excel
        </Button>
        <input
          id="excel-file-input"
          type="file"
          accept=".xlsx,.xls"
          style={{ display: 'none' }}
          onChange={handleFileUpload}
        />
      </Box>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: 'primary.light' }}>
              <TableCell>Mã HV</TableCell>
              <TableCell>Họ tên</TableCell>
              <TableCell>Lớp</TableCell>
              <TableCell>Tình trạng</TableCell>
              <TableCell>Lần sửa cuối</TableCell>
              <TableCell align="right">Thao tác</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {list.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.maHV}</TableCell>
                <TableCell>{row.hoTen}</TableCell>
                <TableCell>{row.className}</TableCell>
                <TableCell>{row.status}</TableCell>
                <TableCell>{row.lastEditAt ? new Date(row.lastEditAt).toLocaleString('vi-VN') : '—'}</TableCell>
                <TableCell align="right">
                  <IconButton size="small" onClick={() => handleOpen(row)}>
                    <EditIcon />
                  </IconButton>
                  <IconButton size="small" color="error" onClick={() => handleDeleteClick(row.id)}>
                    <DeleteIcon />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editId ? 'Sửa học sinh' : 'Thêm học sinh'}</DialogTitle>
        <DialogContent>
          <TextField margin="dense" label="Mã HV" fullWidth value={form.maHV} onChange={(e) => setForm({ ...form, maHV: e.target.value })} required />
          <TextField margin="dense" label="Họ tên" fullWidth value={form.hoTen} onChange={(e) => setForm({ ...form, hoTen: e.target.value })} required />
          <TextField margin="dense" label="Tên gọi" fullWidth value={form.ten} onChange={(e) => setForm({ ...form, ten: e.target.value })} />
          <FormControl fullWidth margin="dense">
            <InputLabel>Lớp</InputLabel>
            <Select value={form.classId} label="Lớp" onChange={(e) => setForm({ ...form, classId: e.target.value })}>
              {classes.map((c) => (
                <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth margin="dense">
            <InputLabel>Tình trạng</InputLabel>
            <Select value={form.status} label="Tình trạng" onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <MenuItem value="đi học">Đi học</MenuItem>
              <MenuItem value="nghỉ">Nghỉ</MenuItem>
              <MenuItem value="bảo lưu">Bảo lưu</MenuItem>
            </Select>
          </FormControl>
          <TextField margin="dense" label="Năm sinh" fullWidth type="number" value={form.namSinh} onChange={(e) => setForm({ ...form, namSinh: e.target.value })} />
          <TextField margin="dense" label="SĐT riêng" fullWidth value={form.soDTRieng} onChange={(e) => setForm({ ...form, soDTRieng: e.target.value })} />
          <TextField margin="dense" label="SĐT phụ huynh" fullWidth value={form.soDTPhuHuynh} onChange={(e) => setForm({ ...form, soDTPhuHuynh: e.target.value })} />
          <TextField margin="dense" label="Tên phụ huynh" fullWidth value={form.tenPhuHuynh} onChange={(e) => setForm({ ...form, tenPhuHuynh: e.target.value })} />
          <TextField margin="dense" label="Địa chỉ" fullWidth value={form.diaChi} onChange={(e) => setForm({ ...form, diaChi: e.target.value })} />
          <TextField margin="dense" label="Giới tính" fullWidth value={form.gioiTinh} onChange={(e) => setForm({ ...form, gioiTinh: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Hủy</Button>
          <Button variant="contained" onClick={handleSave}>Lưu</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={deleteConfirm.open}
        onClose={() => setDeleteConfirm({ open: false, id: null })}
        onConfirm={handleDeleteConfirm}
        title="Xác nhận xóa"
        message="Xóa học sinh này?"
      />

      <Dialog open={importOpen} onClose={handleCloseImport} maxWidth="lg" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Import học sinh từ Excel</span>
            <Button
              variant="outlined"
              size="small"
              startIcon={<DownloadIcon />}
              onClick={handleDownloadTemplate}
              disabled={classes.length === 0}
            >
              Tải file mẫu
            </Button>
          </Box>
        </DialogTitle>
        <DialogContent>
          {importLoading && <LinearProgress sx={{ mb: 2 }} />}
          
          {importResult && (
            <Box sx={{ mb: 2 }}>
              {importResult.success.length > 0 && (
                <Alert severity="success" sx={{ mb: 1 }}>
                  Đã import thành công {importResult.success.length} học sinh
                </Alert>
              )}
                    {importResult.errors.length > 0 && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" sx={{ mb: 0.5, fontWeight: 'bold' }}>
                    Có {importResult.errors.length} lỗi khi import:
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                    Thường gặp: Mã HV trùng trong cùng lớp, thiếu Mã HV/Họ tên, tên lớp không khớp với danh sách lớp.
                  </Typography>
                  <TableContainer component={Paper} sx={{ maxHeight: 200 }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell><strong>Dòng</strong></TableCell>
                          <TableCell><strong>Mã HV</strong></TableCell>
                          <TableCell><strong>Họ tên</strong></TableCell>
                          <TableCell><strong>Mô tả lỗi</strong></TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {(importResult.errors || []).slice(0, 20).map((err, idx) => (
                          <TableRow key={idx}>
                            <TableCell>{err.index ?? '—'}</TableCell>
                            <TableCell>{err.maHV ?? '—'}</TableCell>
                            <TableCell>{err.hoTen ?? '—'}</TableCell>
                            <TableCell sx={{ color: 'error.main' }}>
                              {err.error || 'Lỗi không xác định'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                  {importResult.errors.length > 20 && (
                    <Typography variant="caption" sx={{ mt: 1, display: 'block' }}>
                      ... và {importResult.errors.length - 20} lỗi khác
                    </Typography>
                  )}
                </Alert>
              )}
            </Box>
          )}

          {importData.length > 0 && (
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
                Danh sách học sinh sẽ được import ({importData.length} học sinh):
              </Typography>
              <TableContainer component={Paper} sx={{ maxHeight: 400 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'primary.light' }}>
                      <TableCell><strong>STT</strong></TableCell>
                      <TableCell><strong>Mã HV</strong></TableCell>
                      <TableCell><strong>Họ tên</strong></TableCell>
                      <TableCell><strong>Tên gọi</strong></TableCell>
                      <TableCell><strong>Lớp</strong></TableCell>
                      <TableCell><strong>Tình trạng</strong></TableCell>
                      <TableCell><strong>Năm sinh</strong></TableCell>
                      <TableCell><strong>SĐT riêng</strong></TableCell>
                      <TableCell><strong>SĐT phụ huynh</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {importData.map((student, idx) => (
                      <TableRow key={idx} hover>
                        <TableCell>{idx + 1}</TableCell>
                        <TableCell>{student.maHV || '—'}</TableCell>
                        <TableCell>{student.hoTen || '—'}</TableCell>
                        <TableCell>{student.ten || '—'}</TableCell>
                        <TableCell>
                          {student.classId ? (
                            classes.find(c => c.id === student.classId)?.name || `ID: ${student.classId}`
                          ) : (
                            <span style={{ color: 'red' }}>
                              {student._originalClassName || 'Chưa chọn lớp'}
                            </span>
                          )}
                          {student._usedDefaultClass && (
                            <Typography variant="caption" sx={{ color: 'warning.main', display: 'block' }}>
                              (Mặc định)
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>{student.status || 'đi học'}</TableCell>
                        <TableCell>{student.namSinh || '—'}</TableCell>
                        <TableCell>{student.soDTRieng || '—'}</TableCell>
                        <TableCell>{student.soDTPhuHuynh || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}

          {importData.length === 0 && !importLoading && !importResult && (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography color="text.secondary" sx={{ mb: 2 }}>
                Vui lòng chọn file Excel để xem preview dữ liệu
              </Typography>
              <Button
                variant="outlined"
                startIcon={<UploadFileIcon />}
                onClick={() => document.getElementById('excel-file-input').click()}
                sx={{ mb: 3 }}
              >
                Chọn file Excel
              </Button>
              {classes.length > 0 && (
                <Box sx={{ mt: 3, textAlign: 'left' }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                    <strong>Lưu ý:</strong> Tên lớp trong file Excel phải khớp với một trong các lớp sau:
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    {classes.map((c) => (
                      <Typography 
                        key={c.id} 
                        variant="caption" 
                        sx={{ 
                          bgcolor: 'primary.light', 
                          color: 'primary.contrastText',
                          px: 1, 
                          py: 0.5, 
                          borderRadius: 1 
                        }}
                      >
                        {c.name}
                      </Typography>
                    ))}
                  </Box>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseImport} disabled={importLoading}>
            {importResult ? 'Đóng' : 'Hủy'}
          </Button>
          {!importResult && importData.length > 0 && (
            <Button 
              variant="contained" 
              onClick={handleImport} 
              disabled={importLoading}
              startIcon={<UploadFileIcon />}
            >
              Xác nhận Import ({importData.length} học sinh)
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}
