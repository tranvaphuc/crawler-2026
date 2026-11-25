# Project AI budget

- The user set a combined AI API spending ceiling of **USD 2 per UTC day** for this project, including paid API calls initiated manually from project chats. The existing day boundary resets at 07:00 Asia/Ho_Chi_Minh.
- News AI seed/article reviews share the authoritative `ai_usage` ledger in the existing VPS SQLite database. Preserve its accumulated usage when changing configuration or deploying.
- Any additional paid AI API call for this project must use the same atomic reservation/accounting mechanism and fit within the remaining combined budget. Do not bypass it with direct API tests, separate per-script budgets, or a second ledger. Use mocks for tests where possible.
- Project configuration: `AI_DAILY_BUDGET_USD=2`; live news configuration: `/etc/news-flow/ai.env`. Keep the existing daily call limit unless the user changes it. Never print secrets.
- This API guard cannot meter or enforce the Codex/ChatGPT application's own conversation charges. Do not claim an application-wide or per-chat hard dollar cap has been configured unless an actual supported control has been applied and verified.

## Nguồn bị cấm

- Không bổ sung `fireant.vn` hoặc bất kỳ tên miền con nào vào luồng news hay forum, kể cả khi đồng bộ nguồn hoặc khôi phục cấu hình cũ.

## Luồng tìm link bài mới — người dùng chốt 25/11/2026

- News seed chạy theo vòng đầy đủ: chốt toàn bộ URL trang chủ/chuyên mục/RSS đang cấu hình (31.168 URL tại thời điểm chốt) và đưa hết vào một queue.
- Mỗi URL chỉ có một job trong vòng; timeout HTTP tối đa 2 giây (người dùng cập nhật ngày 25/11/2026). Lỗi thì kết thúc job, không retry trong vòng.
- Không nạp thêm job seed, không ưu tiên quét lặp trang chủ/RSS giữa vòng. Chỉ khi mọi job seed đã kết thúc mới nạp toàn bộ danh sách cho vòng tiếp theo, kể cả URL lỗi ở vòng trước.
- Thay đổi danh sách seed chỉ áp dụng từ vòng tiếp theo. Không tự ý đổi mô hình này hoặc chuyển nhiệm vụ/cấu hình xác thực giữa VPS News và VPS Forum.
