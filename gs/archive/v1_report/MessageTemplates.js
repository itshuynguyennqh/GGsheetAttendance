// ======================================================
// TEMPLATE TIN NHẮN GỬI PHỤ HUYNH (3 NHÓM HỌC LỰC)
// ======================================================

/** Lấy tên hiển thị (bỏ họ): "Nguyễn Hà Anh" -> "Hà Anh" */
function getDisplayName(fullName) {
  if (!fullName || typeof fullName !== "string") return "";
  var parts = String(fullName).trim().split(/\s+/);
  if (parts.length <= 1) return parts[0] || "";
  return parts.slice(1).join(" ");
}

/** Định dạng chi tiết điểm cho template */
function formatChiTietDiem(scores) {
  if (!scores || scores.length === 0) return "";
  var arr = scores.map(function(x) { return typeof x === "number" ? x.toFixed(1) : String(x); });
  var allHigh = arr.every(function(x) { var n = parseFloat(x); return !isNaN(n) && n >= 9; });
  if (allHigh && arr.length >= 1) return "toàn 9 với 10 (" + arr.join(", ") + ")";
  return arr.join(", ");
}

// Template 1-4 (chuẩn cũ - chọn ngẫu nhiên)
function generateMessageTemplate1(student, rangeDate, avgScore, btvnAzotaRate) {
  var lines = [];
  lines.push("Kính gửi PH em " + student.name + " (" + student.class + "),");
  lines.push("Trung tâm gửi báo cáo tổng hợp từ " + rangeDate + ":");
  if (avgScore) lines.push("- Điểm trung bình các bài kiểm tra: " + avgScore);
  if (btvnAzotaRate && btvnAzotaRate !== "N/A") lines.push("- Chỉ số hoàn thành BTVN Azota: " + btvnAzotaRate);
  var errs = [];
  if (student.errors.btvn > 0) errs.push(student.errors.btvn + " lần thiếu BTVN");
  if (student.errors.att > 0) errs.push(student.errors.att + " lần nhắc nhở ý thức");
  lines.push(errs.length > 0 ? "- Tình hình học tập: Con còn mắc " + errs.join(", ") + "." : "- Tình hình học tập: Con đi học và làm bài đầy đủ, ý thức tốt.");
  if (student.details.length > 0) { lines.push("- Chi tiết các buổi cần lưu ý:"); lines.push(student.details.join("\n")); }
  lines.push("Mong gia đình nhắc nhở con để con học tập tốt hơn.");
  lines.push("Trân trọng!");
  return lines.join("\n");
}

function generateMessageTemplate2(student, rangeDate, avgScore, btvnAzotaRate) {
  var lines = [];
  lines.push("Xin chào gia đình em " + student.name + " (" + student.class + "),");
  lines.push("Trung tâm xin gửi báo cáo học tập của con trong khoảng thời gian từ " + rangeDate + ":");
  if (avgScore) lines.push("• Kết quả kiểm tra: Điểm trung bình " + avgScore);
  if (btvnAzotaRate && btvnAzotaRate !== "N/A") lines.push("• BTVN Azota: " + btvnAzotaRate);
  var errs = [];
  if (student.errors.btvn > 0) errs.push(student.errors.btvn + " lần thiếu BTVN");
  if (student.errors.att > 0) errs.push(student.errors.att + " lần nhắc nhở ý thức");
  lines.push(errs.length > 0 ? "• Nhận xét: Con cần cải thiện về " + errs.join(" và ") + "." : "• Nhận xét: Con học tập tốt, đi học đầy đủ và có ý thức tốt.");
  if (student.details.length > 0) { lines.push("• Một số buổi cần lưu ý:"); lines.push(student.details.join("\n")); }
  lines.push("Rất mong gia đình cùng phối hợp để con tiến bộ hơn.");
  lines.push("Cảm ơn gia đình!");
  return lines.join("\n");
}

function generateMessageTemplate3(student, rangeDate, avgScore, btvnAzotaRate) {
  var lines = [];
  lines.push("Gửi PH em " + student.name + " (" + student.class + "),");
  lines.push("Báo cáo từ " + rangeDate + ":");
  if (avgScore) lines.push("- Điểm TB: " + avgScore);
  if (btvnAzotaRate && btvnAzotaRate !== "N/A") lines.push("- BTVN Azota: " + btvnAzotaRate);
  var errs = [];
  if (student.errors.btvn > 0) errs.push(student.errors.btvn + " lần thiếu BTVN");
  if (student.errors.att > 0) errs.push(student.errors.att + " lần nhắc nhở ý thức");
  lines.push(errs.length > 0 ? "- Cần lưu ý: " + errs.join(", ") : "- Tình hình: Tốt");
  if (student.details.length > 0) { lines.push("- Chi tiết:"); lines.push(student.details.join("\n")); }
  lines.push("Hy vọng gia đình nhắc nhở con.");
  lines.push("Trân trọng!");
  return lines.join("\n");
}

function generateMessageTemplate4(student, rangeDate, avgScore, btvnAzotaRate) {
  var lines = [];
  lines.push("Thân gửi PH em " + student.name + " (" + student.class + "),");
  lines.push("Trung tâm gửi báo cáo tổng hợp học tập từ " + rangeDate + ":");
  if (avgScore) lines.push("📊 Điểm số: Trung bình " + avgScore + " điểm");
  if (btvnAzotaRate && btvnAzotaRate !== "N/A") lines.push("📝 BTVN Azota: " + btvnAzotaRate);
  var errs = [];
  if (student.errors.btvn > 0) errs.push(student.errors.btvn + " lần thiếu BTVN");
  if (student.errors.att > 0) errs.push(student.errors.att + " lần nhắc nhở ý thức");
  lines.push(errs.length > 0 ? "📌 Tình hình: Một số điểm cần chú ý - " + errs.join(", ") : "📌 Tình hình: Con học tập tích cực, đi học đầy đủ và có ý thức tốt.");
  if (student.details.length > 0) { lines.push("📋 Chi tiết các buổi học:"); lines.push(student.details.join("\n")); }
  lines.push("Kính mong gia đình quan tâm và nhắc nhở con để con đạt kết quả tốt hơn.");
  lines.push("Chúc gia đình sức khỏe!");
  return lines.join("\n");
}

function generateMessage(student, rangeDate, avgScore, btvnAzotaRate) {
  var templateIndex = Math.floor(Math.random() * 4) + 1;
  switch (templateIndex) {
    case 1: return generateMessageTemplate1(student, rangeDate, avgScore, btvnAzotaRate);
    case 2: return generateMessageTemplate2(student, rangeDate, avgScore, btvnAzotaRate);
    case 3: return generateMessageTemplate3(student, rangeDate, avgScore, btvnAzotaRate);
    case 4: return generateMessageTemplate4(student, rangeDate, avgScore, btvnAzotaRate);
    default: return generateMessageTemplate1(student, rangeDate, avgScore, btvnAzotaRate);
  }
}

/**
 * Nhóm 1: Giỏi/Ngoan. opts: { indicators, thaiDo, phat }
 */
function generateMessageGroup1(student, monthLabel, rangeDate, avg, btvnAzotaRate, opts) {
  var ten = getDisplayName(student.name);
  var chiTietAzota = (btvnAzotaRate && btvnAzotaRate !== "N/A") ? btvnAzotaRate : "hoàn thành đầy đủ";
  var diemTBText = avg ? avg : "cao";
  var lines = [];
  lines.push("Dạ em chào chị ạ.");
  lines.push("Em xin gửi báo cáo kết quả học tập " + monthLabel + " của " + ten + ".");
  lines.push("");
  lines.push("Kết quả tháng này của con rất tốt:");
  lines.push("• Điểm số: Phong độ ổn định, điểm trung bình đạt mức cao " + diemTBText + ".");
  lines.push("• Ý thức: Con đi học đầy đủ, tập trung nghe giảng và hoàn thành tốt các bài tập trên Azota (" + chiTietAzota + ").");
  lines.push("");
  lines.push("Con đang có đà học tập hiệu quả, rất mong gia đình tiếp tục động viên để con duy trì phong độ này trong các tháng tới. Trong quá trình học tập, nếu con có khúc mắc, khó khăn gì mong được gia đình góp ý chia sẻ để lớp học cải thiện chất lượng. Em cảm ơn chị ạ.");
  return lines.join("\n");
}

/**
 * Nhóm 2: Khá / chểnh mảng. opts: { indicators, thaiDo, phat }
 */
function generateMessageGroup2(student, monthLabel, rangeDate, avg, btvnAzotaRate, opts) {
  var ind = opts.indicators || {};
  var ten = getDisplayName(student.name);
  var thaiDo = opts.thaiDo || "chưa tập trung";
  var phat = opts.phat || "";
  var lines = [];
  lines.push("Dạ em chào chị ạ! Em cập nhật tình hình " + monthLabel + " của " + ten + " tới gia đình mình ạ.");
  lines.push("");
  if (ind.diemTB === "ok" && avg) lines.push("Về sức học thì con vẫn nắm được bài (Điểm TB: " + avg + ").");
  else if (avg) lines.push("Về sức học: Điểm TB " + avg + ".");
  if (ind.thaiDo === "ok") lines.push("Trên lớp con ý thức tốt.");
  if (ind.btvnAzota === "ok" && btvnAzotaRate && btvnAzotaRate !== "N/A") lines.push("BTVN Azota con hoàn thành đầy đủ.");
  var needImprove = ind.thaiDo !== "ok" || ind.btvnAzota !== "ok" || ind.diemTB === "nho" || ind.diemTB === "xau" || phat;
  if (needImprove) {
    if (ind.thaiDo !== "ok") lines.push("Tháng này ý thức của con đang hơi \"lỏng\" một chút chị ạ:");
    lines.push("Cần lưu ý:");
    if (ind.diemTB === "nho" || ind.diemTB === "xau") lines.push("- Điểm TB còn cần cải thiện" + (avg ? " (" + avg + ")." : "."));
    if (ind.thaiDo !== "ok") lines.push("- Trên lớp con còn chưa thực sự tập trung (" + thaiDo + ").");
    if (ind.btvnAzota !== "ok") lines.push("- Về nhà con có vài buổi chưa hoàn thành BTVN Azota.");
    if (phat) lines.push("- Cụ thể hôm rồi con có bị phạt: " + phat + ".");
    lines.push("");
    lines.push("Chị nhắc nhẹ để con chấn chỉnh lại thái độ học tập giúp em nha. Kiến thức ngày càng khó, con lơ là xíu là dễ bị trượt điểm ngay ạ. Trong quá trình học tập, nếu con có khúc mắc, khó khăn gì mong được gia đình góp ý chia sẻ để lớp học cải thiện chất lượng. Em cảm ơn chị ạ.");
  } else {
    lines.push("Trong quá trình học tập, nếu con có khúc mắc, khó khăn gì mong được gia đình góp ý chia sẻ để lớp học cải thiện chất lượng. Em cảm ơn chị ạ.");
  }
  return lines.join("\n");
}

/**
 * Nhóm 3: Cần báo động. opts: { indicators, thaiDo, phat }
 */
function generateMessageGroup3(student, monthLabel, rangeDate, avg, btvnAzotaRate, opts) {
  var ind = opts.indicators || {};
  var ten = getDisplayName(student.name);
  var thaiDo = opts.thaiDo || "có lỗi về ý thức";
  var phat = opts.phat || "ghi nhớ lỗi/từ vựng";
  var lines = [];
  lines.push("Em chào chị ạ! Em nhắn tin để trao đổi kỹ hơn về tình hình của " + ten + " " + monthLabel + " ạ.");
  lines.push("");
  var positives = [];
  if (ind.diemTB === "ok" && avg) positives.push("Điểm số ổn (" + avg + ")");
  if (ind.thaiDo === "ok") positives.push("Ý thức trên lớp tốt");
  if (ind.btvnAzota === "ok") positives.push("BTVN Azota hoàn thành");
  if (positives.length > 0) lines.push("Một số điểm tích cực: " + positives.join(". ") + ".");
  lines.push("");
  if (ind.thaiDo !== "ok") {
    lines.push("Thực sự em đang khá lo lắng vì con đang có dấu hiệu sa sút cả về điểm số lẫn ý thức:");
  } else {
    lines.push("Thực sự em đang khá lo lắng vì con đang có dấu hiệu sa sút về điểm số và bài vở:");
  }
  lines.push("");
  if (ind.thaiDo !== "ok") {
    lines.push("Về ý thức: Con thường xuyên " + thaiDo + ". Đỉnh điểm là con phải chép phạt để ghi nhớ lỗi sai/từ vựng.");
  } else if (ind.chepPhat !== "ok") {
    lines.push("Con có chép phạt để ghi nhớ lỗi sai/từ vựng.");
  }
  lines.push("Về bài vở: Con thiếu khá nhiều bài tập Azota.");
  lines.push("");
  lines.push("Trong quá trình học tập, nếu con có khúc mắc, khó khăn gì mong được gia đình góp ý chia sẻ để lớp học cải thiện chất lượng. Em cảm ơn chị ạ.");
  return lines.join("\n");
}
