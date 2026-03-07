# Azota API Reference

Tài liệu này tổng hợp các API Azota thu thập từ HAR (DevTools Network). **Azota không công bố API công khai**; thông tin dưới đây được reverse-engineer từ giao tiếp web app.

> ⚠️ **Lưu ý**: Các API có thể thay đổi bất kỳ lúc nào. Sử dụng cho mục đích nghiên cứu/học tập. Token/session cần đăng nhập Azota trong trình duyệt.

---

## Base URLs

| Service | Base URL |
|---------|----------|
| Teacher API | `https://azt-teacher-api.azota.vn` |
| Student API | `https://azt-student-api.azota.vn` |
| Tracking API | `https://azt-tracking-api.azota.vn` |
| AI API | `https://aiapi.azota.vn` |
| Adsword API | `https://azt-adsword-api.azota.vn` |
| Test Logs API | `https://azt-test-logs-api.azota.vn` |

---

## Authentication

Các API Azota thường dùng **Bearer token** hoặc **Cookie** (session sau khi đăng nhập trên azota.vn). Header thường có:

- `Authorization: Bearer <token>`
- `Cookie: <session cookies>`

Token refresh: `GET /api/Info/RefreshNewToken` (teacher) để gia hạn token.

---

## 1. azt-teacher-api.azota.vn (Teacher API)

### Auth & Info
| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/api/Auth/ExchangeAccessToken` | Đổi access token |
| GET | `/api/Info/RefreshNewToken` | Làm mới token |
| GET | `/api/Info/GetEnvV2` | Cấu hình môi trường |
| GET | `/api/FrontCommon/GetHeaderInfo` | Thông tin header (user, menu) |

### Lớp học & Nhóm
| Method | Path | Mô tả | Query/Body |
|--------|------|-------|------------|
| GET | `/api/Classroom/GetObj` | Chi tiết lớp | `id` |
| GET | `/api/ClassroomGroup/GetObjs` | Danh sách nhóm lớp | `shareType=all` |

### Học sinh & Điểm
| Method | Path | Mô tả | Query/Body |
|--------|------|-------|------------|
| GET | `/api/StudentProfileV2/GetObjsByClassroomId` | Học sinh theo lớp | `classroomId`, `getStatistic` |
| GET | `/api/StudentProfileV2/ListStudentClassrooms` | Lớp của học sinh | |
| POST | `/api/StudentProfileV2/GetObj` | Chi tiết học sinh | body |
| POST | `/api/StudentProfileV2/GetExamResultObjs` | Kết quả thi | body |
| POST | `/api/StudentProfileV2/GetHomeworkAnswerObjs` | Bài tập về nhà | body |
| POST | `/api/MarkManagement/ListStudentMarksByTeacher` | Điểm theo GV | body |
| GET | `/api/Student/RemoveMappingObj` | Xóa mapping học sinh | |
| POST | `/api/Student/SaveObj` | Lưu/cập nhật học sinh | body |

### Đề thi & Kết quả
| Method | Path | Mô tả | Query/Body |
|--------|------|-------|------------|
| GET | `/api/ExamPageResult/GetObjV3` | Chi tiết kết quả đề thi | |
| GET | `/api/ExamPageResult/ListResults` | Danh sách kết quả | |
| GET | `/api/OfflineExamExport/ExportResultOfAllOfflineMixQuestionHashId` | Xuất kết quả offline | |
| GET | `/api/OfflineExamResult/HasOfflineExam` | Kiểm tra có đề offline | |

### Thông báo & Khác
| Method | Path | Mô tả | Query/Body |
|--------|------|-------|------------|
| GET | `/api/Notice/GetAllNoticeRequestForClass` | Thông báo theo lớp | `classId` |
| GET | `/api/NoticeForUser/GetObj` | Thông báo user | |
| GET | `/api/UserCloudStorage/GetObjs` | Cloud storage | |
| GET | `/api/PayAsGoPayment/GetCurrentPoint` | Điểm thanh toán Pay-as-you-go | |
| GET | `/api/VipMustUpgrade/CheckVipMustUpgrade` | Kiểm tra VIP cần nâng cấp | |
| POST | `/api/VipPackage/GetMyPackage` | Gói VIP | |
| POST | `/api/ComboPackage/ListComboPackages` | Danh sách combo gói | |
| GET | `/api/common-list/subject-and-levels` | Môn & cấp học | |
| POST | `/api/documents/list-documents` | Danh sách tài liệu | body |
| POST | `/api/TeacherGroup/GetTeamPermissionObjs` | Quyền nhóm GV | |
| POST | `/api/TrackJsException/SaveObj` | Gửi JS exception | body |

---

## 2. azt-student-api.azota.vn (Student API)

### Auth & Info
| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/api/Auth/ExchangeAccessToken` | Đổi access token |
| GET | `/api/Auth/ExchangeAdswordToken` | Đổi token Adsword |
| GET | `/api/Info/GetEnvV2` | Cấu hình môi trường |
| GET | `/api/FrontCommon/GetHeaderInfo` | Thông tin header |

### Đề thi & Làm bài
| Method | Path | Mô tả | Query/Body |
|--------|------|-------|------------|
| GET | `/api/FrontExam/GetExamObj` | Chi tiết đề thi | |
| GET | `/api/FrontExam/InitData` | Dữ liệu khởi tạo | |
| GET | `/api/FrontExam/MustViewAds` | Phải xem quảng cáo? | |
| GET | `/api/FrontExam/ReloadExamResult` | Tải lại kết quả | |
| POST | `/api/FrontJoinClassroomByExamHashId/GetClassroomsByExamHashId` | Lớp theo hash đề | body |
| POST | `/api/FrontJoinClassroomByExamHashId/JoinClassroomByExamHashId` | Tham gia lớp qua hash | body |

### User & VIP
| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/api/FrontVip/CheckVipObject` | Kiểm tra VIP |
| POST | `/api/VipPackage/GetMyPackage` | Gói VIP |
| GET | `/api/PayAsGoPayment/GetCurrentPoint` | Điểm Pay-as-you-go |
| GET | `/api/UserCloudStorage/GetObjs` | Cloud storage |
| POST | `/api/UserInfo/SaveUserAction` | Lưu hành động user |
| POST | `/api/Parent/ListMyUserParents` | Danh sách phụ huynh |
| GET | `/api/NoticeForUser/GetObj` | Thông báo user |

### Khác
| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/api/common-list/provinces` | Danh sách tỉnh thành |
| POST | `/api/test-market-feedbacks/questions/list` | Câu hỏi feedback |

---

## 3. azt-tracking-api.azota.vn (Tracking API)

| Method | Path | Mô tả |
|--------|------|-------|
| POST | `/azota-tracking/api/FrontAppFiredEvent/Collect` | Thu thập sự kiện app |
| POST | `/azota-tracking/api/FrontAppFiredEvent/CollectByBeacon` | Thu thập qua Beacon |
| POST | `/azota-tracking/api/FrontTrackEvent/SaveEventObj` | Lưu sự kiện tracking |

---

## 4. aiapi.azota.vn (AI API)

| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/ai/api/v1/user/is-locked` | Kiểm tra tài khoản AI bị khóa |
| POST | `/ai/api/v1/recommendation/update-location` | Cập nhật vị trí (recommendation) |

---

## 5. azt-adsword-api.azota.vn (Adsword API)

| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/azota-adsword/api/v10/FrontProduct/GetSchoolLevelSubjectOfStudent` | Môn/cấp học của HS |
| POST | `/azota-adsword/api/v10/FrontProduct/ListRandomProducts` | Danh sách sản phẩm ngẫu nhiên |

---

## 6. azt-test-logs-api.azota.vn

| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/test-logs/api/v1/exam-result-answers/{id}` | Chi tiết câu trả lời kết quả thi |

---

## 7. Private API (azota.vn – main domain)

Base URL: `https://azota.vn`. Dùng khi xem trang kết quả thi trên web (ví dụ URL dạng `.../exam-results-list/.../{examId}/0`).

| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/private-api/exams/{examId}/exam-result` | Danh sách kết quả thi theo đề (examId). Trả về danh sách học sinh đã nộp bài: mỗi item có `mark` (điểm), `nameImages` (object chứa `url` – đường dẫn ảnh crop tên học sinh viết tay). Có thể có thêm `statisticObj`, `markPercent`. Cần header `Authorization: Bearer <token>` (cùng token đăng nhập azota.vn). |

---

## Cách thử API

1. **Swagger UI (local)**: Chạy server (`npm run dev:full` hoặc `node server`), mở `http://localhost:3001/api-docs-azota` để xem và thử API. Bấm **Authorize** → nhập Bearer token lấy từ DevTools.
2. **Swagger Editor**: Mở file `docs/azota-openapi.yaml` bằng [Swagger Editor](https://editor.swagger.io/) (File → Import file).
3. **Postman/Insomnia**: Import file `docs/azota-openapi.yaml`, thiết lập Bearer token lấy từ DevTools (Application → Cookies hoặc Network → request → Headers).
4. **cURL**: Ví dụ:
   ```bash
   curl -H "Authorization: Bearer <TOKEN>" "https://azt-teacher-api.azota.vn/api/ClassroomGroup/GetObjs?shareType=all"
   ```

---

*Nguồn: Thu thập từ azota.vn.har (DevTools Network). Cập nhật: 2025-02.*
