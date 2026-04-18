import { useEffect, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Chip,
  Dialog,
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
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DescriptionIcon from '@mui/icons-material/Description';
import { azotaApiRegistryApi } from '../api';
import ConfirmDialog from '../components/ConfirmDialog';

const STATUS_OPTIONS = [
  { value: 'working', label: 'Đang dùng được', color: 'success' },
  { value: 'deprecated', label: 'Đã lỗi thời', color: 'warning' },
  { value: 'broken', label: 'Không dùng được', color: 'error' },
  { value: 'unknown', label: 'Chưa kiểm tra', color: 'default' },
];

function formatDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export default function Azota() {
  const [tab, setTab] = useState(0);
  const [registry, setRegistry] = useState({ endpoints: [], meta: {} });
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editEp, setEditEp] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, id: null });
  const [form, setForm] = useState({
    method: 'GET',
    path: '',
    baseUrl: 'https://azota.vn',
    description: '',
    status: 'unknown',
    notes: '',
  });
  const [editForm, setEditForm] = useState({ status: 'unknown', lastCheckedAt: '', notes: '' });

  const load = async () => {
    try {
      const data = await azotaApiRegistryApi.get();
      setRegistry(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleAddOpen = () => {
    setForm({
      method: 'GET',
      path: '',
      baseUrl: 'https://azota.vn',
      description: '',
      status: 'unknown',
      notes: '',
    });
    setAddOpen(true);
  };

  const handleAddSave = async () => {
    try {
      await azotaApiRegistryApi.addEndpoint(form);
      setAddOpen(false);
      load();
    } catch (e) {
      alert(e?.message || 'Lỗi thêm endpoint');
    }
  };

  const handleEditOpen = (ep) => {
    setEditEp(ep);
    setEditForm({
      status: ep.status || 'unknown',
      lastCheckedAt: ep.lastCheckedAt ? ep.lastCheckedAt.slice(0, 16) : '',
      notes: ep.notes || '',
    });
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    if (!editEp) return;
    try {
      const payload = { status: editForm.status, notes: editForm.notes };
      if (editForm.lastCheckedAt) payload.lastCheckedAt = new Date(editForm.lastCheckedAt).toISOString();
      await azotaApiRegistryApi.updateEndpoint(editEp.id, payload);
      setEditOpen(false);
      setEditEp(null);
      load();
    } catch (e) {
      alert(e?.message || 'Lỗi cập nhật');
    }
  };

  const handleMarkChecked = async (ep) => {
    try {
      await azotaApiRegistryApi.updateEndpoint(ep.id, {
        lastCheckedAt: new Date().toISOString(),
        status: ep.status,
      });
      load();
    } catch (e) {
      alert(e?.message || 'Lỗi cập nhật');
    }
  };

  const handleDeleteConfirm = async () => {
    const id = deleteConfirm.id;
    if (!id) return;
    try {
      await azotaApiRegistryApi.deleteEndpoint(id);
      setDeleteConfirm({ open: false, id: null });
      load();
    } catch (e) {
      alert(e?.message || 'Lỗi xóa');
    }
  };

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2, fontFamily: 'Lora, serif' }}>
        Quản lý Azota
      </Typography>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tab label="Tổng quan" />
        <Tab label="Azota API Docs" />
        <Tab label="Registry API" />
        <Tab label="Cách thu thập API" />
      </Tabs>

      {tab === 0 && (
        <Paper sx={{ p: 3 }}>
          <Typography color="text.secondary" paragraph>
            Trang này dùng để <strong>ghi nhận và quản lý các API mà Azota (azota.vn) sử dụng</strong>, đồng thời
            theo dõi trạng thái từng endpoint khi Azota cập nhật (endpoint đổi hoặc không dùng được nữa).
          </Typography>
          <Typography color="text.secondary" paragraph>
            Azota không công bố API công khai. Bạn có thể thu thập endpoint bằng DevTools (tab Network) khi dùng
            azota.vn, sau đó thêm vào <strong>Registry API</strong> và đánh dấu trạng thái: đang dùng được, đã lỗi thời,
            không dùng được, hoặc chưa kiểm tra.
          </Typography>
          <Button
            variant="outlined"
            startIcon={<DescriptionIcon />}
            href="/api-docs"
            target="_blank"
            rel="noopener noreferrer"
          >
            Xem API Docs (Swagger) của server
          </Button>
        </Paper>
      )}

      {tab === 1 && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Azota API Docs
          </Typography>
          <Typography color="text.secondary" paragraph>
            Tài liệu chi tiết nằm tại <code>docs/AZOTA_API_DOCS.md</code> trong repo, gồm:
          </Typography>
          <ul style={{ marginTop: 0, paddingLeft: 20 }}>
            <li><strong>Cách cào API</strong>: Dùng DevTools (Network / Fetch-XHR) khi dùng azota.vn; ghi lại Method, URL, mô tả; hoặc export HAR.</li>
            <li><strong>Format Registry</strong>: Mỗi endpoint có method, path, baseUrl, description, status (working / deprecated / broken / unknown), lastCheckedAt, notes.</li>
            <li><strong>Quản lý khi Azota cập nhật</strong>: Đánh dấu endpoint broken/deprecated, ghi notes, tìm endpoint thay thế và thêm vào Registry.</li>
          </ul>
          <Typography color="text.secondary">
            Danh sách endpoint đang quản lý nằm ở tab <strong>Registry API</strong> bên dưới.
          </Typography>
        </Paper>
      )}

      {tab === 2 && (
        <Paper sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="subtitle1">
              Danh sách endpoint Azota ({registry.endpoints?.length ?? 0})
              {registry.meta?.lastUpdated && (
                <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                  Cập nhật: {formatDate(registry.meta.lastUpdated)}
                </Typography>
              )}
            </Typography>
            <Button variant="contained" startIcon={<AddIcon />} onClick={handleAddOpen}>
              Thêm endpoint
            </Button>
          </Box>
          {loading ? (
            <Typography color="text.secondary">Đang tải…</Typography>
          ) : !registry.endpoints?.length ? (
            <Typography color="text.secondary">
              Chưa có endpoint nào. Bấm &quot;Thêm endpoint&quot; hoặc thu thập từ DevTools (tab Cách thu thập API).
            </Typography>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Method</TableCell>
                    <TableCell>Path</TableCell>
                    <TableCell>Base URL</TableCell>
                    <TableCell>Mô tả</TableCell>
                    <TableCell>Trạng thái</TableCell>
                    <TableCell>Lần kiểm tra</TableCell>
                    <TableCell>Ghi chú</TableCell>
                    <TableCell align="right">Thao tác</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {registry.endpoints.map((ep) => (
                    <TableRow key={ep.id}>
                      <TableCell>{ep.method}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace' }}>{ep.path}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', maxWidth: 140 }} title={ep.baseUrl}>
                        {ep.baseUrl ? (ep.baseUrl.length > 24 ? ep.baseUrl.slice(0, 24) + '…' : ep.baseUrl) : '—'}
                      </TableCell>
                      <TableCell>{ep.description || '—'}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={STATUS_OPTIONS.find((s) => s.value === ep.status)?.label ?? ep.status}
                          color={STATUS_OPTIONS.find((s) => s.value === ep.status)?.color ?? 'default'}
                        />
                      </TableCell>
                      <TableCell>{formatDate(ep.lastCheckedAt)}</TableCell>
                      <TableCell sx={{ maxWidth: 160 }} title={ep.notes}>
                        {ep.notes ? (ep.notes.length > 20 ? ep.notes.slice(0, 20) + '…' : ep.notes) : '—'}
                      </TableCell>
                      <TableCell align="right">
                        <Button size="small" startIcon={<EditIcon />} onClick={() => handleEditOpen(ep)}>
                          Sửa
                        </Button>
                        <Button size="small" onClick={() => handleMarkChecked(ep)}>
                          Đánh dấu đã kiểm tra
                        </Button>
                        <Button
                          size="small"
                          color="error"
                          startIcon={<DeleteIcon />}
                          onClick={() => setDeleteConfirm({ open: true, id: ep.id })}
                        >
                          Xóa
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      )}

      {tab === 3 && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="subtitle1" gutterBottom>
            Cách thu thập (cào) API từ Azota
          </Typography>
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography>1. Dùng DevTools (Chrome / Edge)</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography component="div" variant="body2" color="text.secondary">
                <ol style={{ paddingLeft: 20, margin: 0 }}>
                  <li>Mở <a href="https://azota.vn" target="_blank" rel="noopener noreferrer">azota.vn</a>, đăng nhập.</li>
                  <li>Mở DevTools (F12) → tab <strong>Network</strong>.</li>
                  <li>Bật <strong>Preserve log</strong>.</li>
                  <li>Lọc <strong>Fetch/XHR</strong> để chỉ xem request API.</li>
                  <li>Thao tác trên Azota (vào lớp, xem bài tập, điểm…).</li>
                  <li>Mỗi request hiện Method, URL, Headers, Payload, Response. Ghi lại Method + URL (hoặc Base URL + Path) và mô tả ngắn, rồi thêm vào Registry (tab Registry API).</li>
                </ol>
              </Typography>
            </AccordionDetails>
          </Accordion>
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography>2. Export HAR (tùy chọn)</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="body2" color="text.secondary">
                Trong Network, chuột phải → <strong>Save all as HAR with content</strong> → lưu file .har.
                Có thể dùng script hoặc công cụ parse HAR để lấy danh sách URL + method rồi thêm vào Registry (tính năng import HAR có thể bổ sung sau).
              </Typography>
            </AccordionDetails>
          </Accordion>
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography>3. Khi Azota cập nhật – API không dùng được</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="body2" color="text.secondary">
                Vào tab <strong>Registry API</strong>, mở <strong>Sửa</strong> endpoint đó → đổi trạng thái sang
                &quot;Không dùng được&quot; hoặc &quot;Đã lỗi thời&quot;, ghi chú (ví dụ: &quot;404 từ 2025-02-06&quot;).
                Dùng lại DevTools trên azota.vn để tìm request mới (endpoint thay thế) và thêm vào Registry với trạng thái &quot;Đang dùng được&quot;.
              </Typography>
            </AccordionDetails>
          </Accordion>
        </Paper>
      )}

      {/* Dialog thêm endpoint */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Thêm endpoint Azota</DialogTitle>
        <DialogContent>
          <FormControl fullWidth size="small" sx={{ mt: 1, mb: 1 }}>
            <InputLabel>Method</InputLabel>
            <Select
              value={form.method}
              label="Method"
              onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))}
            >
              <MenuItem value="GET">GET</MenuItem>
              <MenuItem value="POST">POST</MenuItem>
              <MenuItem value="PUT">PUT</MenuItem>
              <MenuItem value="PATCH">PATCH</MenuItem>
              <MenuItem value="DELETE">DELETE</MenuItem>
            </Select>
          </FormControl>
          <TextField
            fullWidth
            label="Base URL"
            size="small"
            value={form.baseUrl}
            onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
            sx={{ mt: 1 }}
          />
          <TextField
            fullWidth
            label="Path (ví dụ: /api/v1/classrooms)"
            size="small"
            value={form.path}
            onChange={(e) => setForm((f) => ({ ...f, path: e.target.value }))}
            sx={{ mt: 1 }}
          />
          <TextField
            fullWidth
            label="Mô tả"
            size="small"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            sx={{ mt: 1 }}
          />
          <FormControl fullWidth size="small" sx={{ mt: 1 }}>
            <InputLabel>Trạng thái</InputLabel>
            <Select
              value={form.status}
              label="Trạng thái"
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
            >
              {STATUS_OPTIONS.map((o) => (
                <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            fullWidth
            label="Ghi chú"
            size="small"
            multiline
            rows={2}
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>Hủy</Button>
          <Button variant="contained" onClick={handleAddSave}>Thêm</Button>
        </DialogActions>
      </Dialog>

      {/* Dialog sửa trạng thái / ghi chú */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Cập nhật trạng thái API</DialogTitle>
        <DialogContent>
          {editEp && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {editEp.method} {editEp.baseUrl}{editEp.path}
            </Typography>
          )}
          <FormControl fullWidth size="small" sx={{ mt: 1, mb: 1 }}>
            <InputLabel>Trạng thái</InputLabel>
            <Select
              value={editForm.status}
              label="Trạng thái"
              onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
            >
              {STATUS_OPTIONS.map((o) => (
                <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            fullWidth
            label="Lần kiểm tra (datetime-local)"
            type="datetime-local"
            size="small"
            value={editForm.lastCheckedAt}
            onChange={(e) => setEditForm((f) => ({ ...f, lastCheckedAt: e.target.value }))}
            InputLabelProps={{ shrink: true }}
            sx={{ mt: 1 }}
          />
          <TextField
            fullWidth
            label="Ghi chú (khi Azota cập nhật, lỗi gặp phải…)"
            size="small"
            multiline
            rows={3}
            value={editForm.notes}
            onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Hủy</Button>
          <Button variant="contained" onClick={handleEditSave}>Lưu</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={deleteConfirm.open}
        title="Xóa endpoint?"
        message="Bạn có chắc muốn xóa endpoint này khỏi Registry?"
        onConfirm={handleDeleteConfirm}
        onClose={() => setDeleteConfirm({ open: false, id: null })}
      />
    </Box>
  );
}
