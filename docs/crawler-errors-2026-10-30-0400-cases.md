# Toàn bộ nhóm lỗi và case — 04:00 ngày 30/10/2026

Cửa sổ: **30/10/2026 00:46:47.308 → 30/10/2026 04:00:20.967 ICT**. Tất cả thời gian case bên dưới là giờ Việt Nam.

Giữ nguyên **148 groupKey** theo queue/platform và toàn bộ chiều chẩn đoán. Mỗi nhóm có tối đa hai job thật; nhóm chỉ có một job được ghi rõ. Mã trống là không ghi/không áp dụng, không phải bằng chứng thành công.

[Báo cáo chính](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400.md) · [Ma trận CSV](/Users/phuctran/Workspace/crawler-2026/docs/crawler-errors-2026-10-30-0400-groups.csv)

Các mức đếm: RQ=request_error; RT=read_retry; RF=read_failure; JF=job_failed. Một request có thể xuất hiện ở RQ rồi RT/RF và cuối cùng JF; không cộng các mức thành số request độc lập. Các nhãn khác nhau do alias và tầng xử lý vẫn giữ nguyên ở đây.

## G001 — facebook-group-source / AUTH_REQUIRED

`AUTH_REQUIRED__HTTP_RESPONSE__HTTP_200__BR__BOOTSTRAP__BOOTSTRAP`

Group key: `70187ab018eac195f0c88b5f4de342703bc9b1e95cf0ce58a9d8f9910930dff4`. Lần đầu 30/10/2026 00:46:54.064; lần cuối 30/10/2026 04:00:18.156.

**Số ghi nhận riêng từng mức:** RQ=0; RT=7.027; RF=2.544; JF=0. Tổng bản ghi quan sát=9.571.

**Quan sát:** HTTP 200 đã nhận đủ body; reader nhận diện nội dung yêu cầu đăng nhập tại bootstrap. Đây là cổng xác thực ở mức nội dung, không phải HTTP 401 hay reset socket.

**Chưa biết/giới hạn:** Toàn bộ mẫu auth trong cửa sổ có confirmed=false; một số xuất hiện sau khi đã có dữ liệu công khai. Chưa chứng minh source private, proxy bị chặn, hay template chắc chắn sai.

**Hướng xử lý:** Đối chiếu cùng source qua endpoint khác bằng phiên anonymous sạch và giữ dấu hiệu login/route đã khử bí mật. Tách trường hợp ban đầu với sau dữ liệu công khai; không gắn nhãn private chỉ từ login page.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `http_response` |
| originalReason | `AUTH_REQUIRED` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `200` |
| apiCode | `—` |
| operation | `bootstrap` |
| query | `bootstrap` |
| stage | `—` |
| bodyEncoding | `br` |
| wireComplete | `true` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `47bebe48cfd9024aaad020297b72807dab77d1e3c4eab653451eb6af80adb0ff`; event ID: `217a8676-3b57-46b0-94d0-147543ecaaa7`.
- Thời điểm: **30/10/2026 01:11:04.712 ICT**; mức `read_retry`; retry đã ghi: `1`.
- Source: [https://www.facebook.com/groups/2056827897939771](https://www.facebook.com/groups/2056827897939771).
- Request route: `—`.
- elapsedMs=14385; wireBytes=75662; decodedBytes=365024; wireComplete=true.
- Proxy endpoint hash: `e6f397cb2ff59e4087b3932cfac8e3a813a0df748eb91ebf76ae58e6e0c59d71` (không phải địa chỉ/credential proxy).
- Auth evidence: `{"classification": "unverified", "confirmed": false, "stage": "initial", "evidence": "anonymous_login_or_checkpoint"}`.

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 302 / 200 | false | 1686 | 2274 | 17257 | 0 / None | true | — |
| 2 | complete / complete | 200 / None | true | 1 | 990 | 14385 | 75662 / 365024 | true | — |

### Case 2

- Job ID: `767a10a97aec81dcec62b8ae81715b69fb3ebbdd4b3b79f11500cb93f2888138`; event ID: `ad3187bb-5cf3-4ec7-b7aa-8ae456a09427`.
- Thời điểm: **30/10/2026 02:53:05.838 ICT**; mức `read_retry`; retry đã ghi: `1`.
- Source: [https://www.facebook.com/groups/383752462708028](https://www.facebook.com/groups/383752462708028).
- Request route: `—`.
- elapsedMs=9575; wireBytes=75636; decodedBytes=364704; wireComplete=true.
- Proxy endpoint hash: `0a756cc5269ddfeca9187549e4546bd9c970856378e8dd1409becf11b3d9a818` (không phải địa chỉ/credential proxy).
- Auth evidence: `{"classification": "unverified", "confirmed": false, "stage": "initial", "evidence": "anonymous_login_or_checkpoint"}`.

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 302 / 200 | false | 1540 | 2352 | 12355 | 0 / None | true | — |
| 2 | complete / complete | 200 / None | true | 0 | 1075 | 9575 | 75636 / 364704 | true | — |

## G002 — facebook-comment / AUTH_REQUIRED

`AUTH_REQUIRED__HTTP_RESPONSE__HTTP_200__BR__BOOTSTRAP__BOOTSTRAP`

Group key: `40e60ec00684f8825708dd5950cf1e179c081b53feedf015b470051d8de7ced8`. Lần đầu 30/10/2026 00:46:59.182; lần cuối 30/10/2026 04:00:18.192.

**Số ghi nhận riêng từng mức:** RQ=0; RT=7.929; RF=1.043; JF=0. Tổng bản ghi quan sát=8.972.

**Quan sát:** HTTP 200 đã nhận đủ body; reader nhận diện nội dung yêu cầu đăng nhập tại bootstrap. Đây là cổng xác thực ở mức nội dung, không phải HTTP 401 hay reset socket.

**Chưa biết/giới hạn:** Toàn bộ mẫu auth trong cửa sổ có confirmed=false; một số xuất hiện sau khi đã có dữ liệu công khai. Chưa chứng minh source private, proxy bị chặn, hay template chắc chắn sai.

**Hướng xử lý:** Đối chiếu cùng source qua endpoint khác bằng phiên anonymous sạch và giữ dấu hiệu login/route đã khử bí mật. Tách trường hợp ban đầu với sau dữ liệu công khai; không gắn nhãn private chỉ từ login page.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `http_response` |
| originalReason | `AUTH_REQUIRED` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `200` |
| apiCode | `—` |
| operation | `bootstrap` |
| query | `bootstrap` |
| stage | `—` |
| bodyEncoding | `br` |
| wireComplete | `true` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `5f4793aa572813a2fc47fb44e2ab855f077cda3574cd3bf41ced21422a2d7aba`; event ID: `c0b66914-8e2d-4e34-b1f3-e2ccc41e6669`.
- Thời điểm: **30/10/2026 02:53:00.267 ICT**; mức `read_retry`; retry đã ghi: `1`.
- Source: [https://www.facebook.com/groups/1545294632435900](https://www.facebook.com/groups/1545294632435900).
- Post: [https://www.facebook.com/1545294632435900_4259821847649818](https://www.facebook.com/1545294632435900_4259821847649818).
- Request route: `—`.
- elapsedMs=8470; wireBytes=75087; decodedBytes=363335; wireComplete=true.
- Proxy endpoint hash: `cd4295c33f9ecc70a23629f4c9a2fb87b8a6a614ceaf3949eea52579523d251d` (không phải địa chỉ/credential proxy).
- Auth evidence: `{"classification": "unverified", "confirmed": false, "stage": "initial", "evidence": "anonymous_login_or_checkpoint"}`.

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 302 / 200 | false | 2189 | 2941 | 11642 | 0 / None | true | — |
| 2 | complete / complete | 200 / None | true | 0 | 714 | 8470 | 75087 / 363335 | true | — |

### Case 2

- Job ID: `786e05ce5214fbf4bdfac111502adebc21ad5d07279019c327a58fd04662b346`; event ID: `70c51fff-20dc-489f-a729-45384fd4c860`.
- Thời điểm: **30/10/2026 03:10:09.843 ICT**; mức `read_retry`; retry đã ghi: `1`.
- Source: [https://www.facebook.com/groups/1658624727884777](https://www.facebook.com/groups/1658624727884777).
- Post: [https://www.facebook.com/1658624727884777_2689339744813265](https://www.facebook.com/1658624727884777_2689339744813265).
- Request route: `—`.
- elapsedMs=10837; wireBytes=74975; decodedBytes=363236; wireComplete=true.
- Proxy endpoint hash: `f2bd6a7a4ebce4d3b58c87ed69f1a2df8be4cb3c1ad1e8ddf3323dc53e5f4c69` (không phải địa chỉ/credential proxy).
- Auth evidence: `{"classification": "unverified", "confirmed": false, "stage": "initial", "evidence": "anonymous_login_or_checkpoint"}`.

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 302 / 200 | false | 1500 | 2254 | 13277 | 0 / None | true | — |
| 2 | complete / complete | 200 / None | true | 0 | 695 | 10837 | 74975 / 363236 | true | — |

## G003 — youtube-comment / UPSTREAM_NETWORK_ERROR

`UPSTREAM_NETWORK_ERROR__PROXY_TLS__ECONNRESET__COMMENTS`

Group key: `446a417c18bbf072b57a97b1a0be875b3786c7950365f542031f550a00f12b6a`. Lần đầu 30/10/2026 00:47:03.119; lần cuối 30/10/2026 04:00:20.753.

**Số ghi nhận riêng từng mức:** RQ=4.210; RT=4.210; RF=0; JF=0. Tổng bản ghi quan sát=8.420.

**Quan sát:** Kết nối bị reset khi TLS tới origin qua proxy tunnel chưa hoàn tất; ở các case có CONNECT 200 thì tunnel HTTP đã được thiết lập, chưa có HTTP response của origin.

**Chưa biết/giới hạn:** Mã reset không xác định ai cắt: proxy, upstream, intermediary hay thay đổi đường truyền. Không phải reset khi đọc header/body.

**Hướng xử lý:** A/B có kiểm soát theo endpoint hash/target/operation, ghi peer/tunnel timing và trạng thái TLS; kiểm tra nhà cung cấp/đường CONNECT trước khi tăng worker. Không quarantine IP khi chưa có bằng chứng CONNECT-specific.

| Thuộc tính | Giá trị |
|---|---|
| platform | `youtube` |
| phase | `proxy_tls` |
| originalReason | `UPSTREAM_NETWORK_ERROR` |
| nativeCode | `ECONNRESET` |
| connectStatus | `200` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `comments` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `9d113cbdafffa1ae5a373cc243532bb8ca15eaa897f0a310c6c52556a0ce0733`; event ID: `603c5c3b-0224-41cd-b8df-6734c8bc5f55`.
- Thời điểm: **30/10/2026 02:56:16.599 ICT**; mức `request_error`; retry đã ghi: `0`.
- Source: [https://www.youtube.com/channel/UCsL47FIpBar8xu5scSfUG-A](https://www.youtube.com/channel/UCsL47FIpBar8xu5scSfUG-A).
- Post: [https://www.youtube.com/watch?v=wk2Pt1B3Oek](https://www.youtube.com/watch?v=wk2Pt1B3Oek).
- Request route: `https://www.youtube.com/watch`.
- elapsedMs=10933; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `69a81c8b5a5f0214f5716df7669560ea18ded4f5dbdab609d2bcaeb05aab8358` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_tls / error | None / 200 | false | — | — | 10933 | 0 / None | — | ECONNRESET |

### Case 2

- Job ID: `4615e1a59bbb8773783a765564268262ddb732b4dae1f9cd25d84c1b0aaef371`; event ID: `c410913c-b39e-41db-824c-5099a3d84c67`.
- Thời điểm: **30/10/2026 03:06:19.120 ICT**; mức `request_error`; retry đã ghi: `0`.
- Source: [https://www.youtube.com/channel/UCOEvEldWBMOHNdlzcofFa9w](https://www.youtube.com/channel/UCOEvEldWBMOHNdlzcofFa9w).
- Post: [https://www.youtube.com/watch?v=vj1Kus6POX0](https://www.youtube.com/watch?v=vj1Kus6POX0).
- Request route: `https://www.youtube.com/watch`.
- elapsedMs=11150; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `69a81c8b5a5f0214f5716df7669560ea18ded4f5dbdab609d2bcaeb05aab8358` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_tls / error | None / 200 | false | — | — | 11150 | 0 / None | — | ECONNRESET |

## G004 — facebook-reply / AUTH_REQUIRED

`AUTH_REQUIRED__HTTP_RESPONSE__HTTP_200__BR__BOOTSTRAP__BOOTSTRAP`

Group key: `63b501fab51426248bc37563d76d5f0cc029bc9ac1fd7ebc910f0481c891c62c`. Lần đầu 30/10/2026 00:47:13.043; lần cuối 30/10/2026 04:00:16.704.

**Số ghi nhận riêng từng mức:** RQ=0; RT=6.360; RF=712; JF=0. Tổng bản ghi quan sát=7.072.

**Quan sát:** HTTP 200 đã nhận đủ body; reader nhận diện nội dung yêu cầu đăng nhập tại bootstrap. Đây là cổng xác thực ở mức nội dung, không phải HTTP 401 hay reset socket.

**Chưa biết/giới hạn:** Toàn bộ mẫu auth trong cửa sổ có confirmed=false; một số xuất hiện sau khi đã có dữ liệu công khai. Chưa chứng minh source private, proxy bị chặn, hay template chắc chắn sai.

**Hướng xử lý:** Đối chiếu cùng source qua endpoint khác bằng phiên anonymous sạch và giữ dấu hiệu login/route đã khử bí mật. Tách trường hợp ban đầu với sau dữ liệu công khai; không gắn nhãn private chỉ từ login page.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `http_response` |
| originalReason | `AUTH_REQUIRED` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `200` |
| apiCode | `—` |
| operation | `bootstrap` |
| query | `bootstrap` |
| stage | `—` |
| bodyEncoding | `br` |
| wireComplete | `true` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `a8855bfe3f1a541844ca0de5a44c3357c342a78e6c3625f16a0afa9e7b1a95d2`; event ID: `3b0ebf9e-10ae-48cb-8503-e3fb532af6b8`.
- Thời điểm: **30/10/2026 02:33:29.348 ICT**; mức `read_retry`; retry đã ghi: `2`.
- Source: [https://www.facebook.com/groups/1075854446205899](https://www.facebook.com/groups/1075854446205899).
- Post: [https://www.facebook.com/1075854446205899_2787032695088057](https://www.facebook.com/1075854446205899_2787032695088057).
- Request route: `—`.
- elapsedMs=10075; wireBytes=75030; decodedBytes=363385; wireComplete=true.
- Proxy endpoint hash: `ce4a66066f5431f40d815cc0ad4ebdaee32e61e699f1f4e78b685a830d4d8009` (không phải địa chỉ/credential proxy).
- Auth evidence: `{"classification": "unverified", "confirmed": false, "stage": "initial", "evidence": "anonymous_login_or_checkpoint"}`.

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 302 / 200 | false | 1689 | 2386 | 12861 | 0 / None | true | — |
| 2 | complete / complete | 200 / None | true | 1 | 916 | 10075 | 75030 / 363385 | true | — |

### Case 2

- Job ID: `4d11fb51549f828df5562672b412546b99451551b552ee56c06c5539bfdedd3d`; event ID: `8b89b1d6-021d-43e2-b37e-beea082b9889`.
- Thời điểm: **30/10/2026 03:26:25.924 ICT**; mức `read_retry`; retry đã ghi: `1`.
- Source: [https://www.facebook.com/groups/1299549267218955](https://www.facebook.com/groups/1299549267218955).
- Post: [https://www.facebook.com/1299549267218955_2544406812733188](https://www.facebook.com/1299549267218955_2544406812733188).
- Request route: `—`.
- elapsedMs=10537; wireBytes=74938; decodedBytes=363147; wireComplete=true.
- Proxy endpoint hash: `2becb4985e92d60fe4ef9e97d04f2f9c303e486e180844eaab3f716aae6f9533` (không phải địa chỉ/credential proxy).
- Auth evidence: `{"classification": "unverified", "confirmed": false, "stage": "initial", "evidence": "anonymous_login_or_checkpoint"}`.

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 302 / 200 | false | 1640 | 2333 | 13060 | 0 / None | true | — |
| 2 | complete / complete | 200 / None | true | 1 | 796 | 10537 | 74938 / 363147 | true | — |

## G005 — facebook-comment / UPSTREAM_NETWORK_ERROR

`UPSTREAM_NETWORK_ERROR__PROXY_TLS__ECONNRESET__BOOTSTRAP__BOOTSTRAP`

Group key: `18da388c436257fcad78de10ce774a1b743a88ec4e03adb9d149f18b36859ad6`. Lần đầu 30/10/2026 00:47:18.901; lần cuối 30/10/2026 04:00:20.762.

**Số ghi nhận riêng từng mức:** RQ=6.970; RT=0; RF=0; JF=0. Tổng bản ghi quan sát=6.970.

**Quan sát:** Kết nối bị reset khi TLS tới origin qua proxy tunnel chưa hoàn tất; ở các case có CONNECT 200 thì tunnel HTTP đã được thiết lập, chưa có HTTP response của origin.

**Chưa biết/giới hạn:** Mã reset không xác định ai cắt: proxy, upstream, intermediary hay thay đổi đường truyền. Không phải reset khi đọc header/body.

**Hướng xử lý:** A/B có kiểm soát theo endpoint hash/target/operation, ghi peer/tunnel timing và trạng thái TLS; kiểm tra nhà cung cấp/đường CONNECT trước khi tăng worker. Không quarantine IP khi chưa có bằng chứng CONNECT-specific.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `proxy_tls` |
| originalReason | `UPSTREAM_NETWORK_ERROR` |
| nativeCode | `ECONNRESET` |
| connectStatus | `200` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `bootstrap` |
| query | `bootstrap` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `2d174a0f730e2c2261ef42603414a55f193edb4d62795721ce50d0819209a2cc`; event ID: `eee1f2b2-d59b-4389-b07c-5429b237e4fd`.
- Thời điểm: **30/10/2026 03:11:05.926 ICT**; mức `request_error`; retry đã ghi: `0`.
- Source: [https://www.facebook.com/groups/166354915370413](https://www.facebook.com/groups/166354915370413).
- Post: [https://www.facebook.com/166354915370413_1439593074713251](https://www.facebook.com/166354915370413_1439593074713251).
- Request route: `https://www.facebook.com/166354915370413_1439593074713251`.
- elapsedMs=26453; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `f0154747fd463a4eaa4d1cb4e5d512b2e68a2b89e62fc66699afb69b8ea8864d` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_tls / error | None / 200 | false | — | — | 26453 | 0 / None | — | ECONNRESET |

### Case 2

- Job ID: `6ef97455d2bf45d6308ce4e0662cf020778544a2e4bdf6eafdc37b87d8abda84`; event ID: `b77660d9-5d08-434c-a682-5339d21a2100`.
- Thời điểm: **30/10/2026 03:47:26.612 ICT**; mức `request_error`; retry đã ghi: `1`.
- Source: [https://www.facebook.com/groups/203774629805058](https://www.facebook.com/groups/203774629805058).
- Post: [https://www.facebook.com/203774629805058_3646057398910080](https://www.facebook.com/203774629805058_3646057398910080).
- Request route: `https://www.facebook.com/203774629805058_3646057398910080`.
- elapsedMs=26750; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `2becb4985e92d60fe4ef9e97d04f2f9c303e486e180844eaab3f716aae6f9533` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_tls / error | None / 200 | false | — | — | 26750 | 0 / None | — | ECONNRESET |

## G006 — facebook-comment / NETWORK_ERROR

`NETWORK_ERROR__PROXY_TLS__ECONNRESET__BOOTSTRAP__BOOTSTRAP`

Group key: `2ca58c1628bde881043d032a600b7fef3e2a522692c2bd7cc1f32ce843456ff2`. Lần đầu 30/10/2026 00:47:19.629; lần cuối 30/10/2026 04:00:19.342.

**Số ghi nhận riêng từng mức:** RQ=0; RT=6.969; RF=0; JF=0. Tổng bản ghi quan sát=6.969.

**Quan sát:** Kết nối bị reset khi TLS tới origin qua proxy tunnel chưa hoàn tất; ở các case có CONNECT 200 thì tunnel HTTP đã được thiết lập, chưa có HTTP response của origin.

**Chưa biết/giới hạn:** Mã reset không xác định ai cắt: proxy, upstream, intermediary hay thay đổi đường truyền. Không phải reset khi đọc header/body.

**Hướng xử lý:** A/B có kiểm soát theo endpoint hash/target/operation, ghi peer/tunnel timing và trạng thái TLS; kiểm tra nhà cung cấp/đường CONNECT trước khi tăng worker. Không quarantine IP khi chưa có bằng chứng CONNECT-specific.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `proxy_tls` |
| originalReason | `NETWORK_ERROR` |
| nativeCode | `ECONNRESET` |
| connectStatus | `200` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `bootstrap` |
| query | `bootstrap` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `81469640e39dba59b557c0376473ac9a991c9dc753ff6b0f0b967a4e3e5263bd`; event ID: `72bd21c7-e6a8-4c55-a882-99c6e561d80d`.
- Thời điểm: **30/10/2026 01:32:49.677 ICT**; mức `read_retry`; retry đã ghi: `1`.
- Source: [https://www.facebook.com/groups/1142235453227527](https://www.facebook.com/groups/1142235453227527).
- Post: [https://www.facebook.com/1142235453227527_2651885378929186](https://www.facebook.com/1142235453227527_2651885378929186).
- Request route: `https://www.facebook.com/1142235453227527_2651885378929186`.
- elapsedMs=26633; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `0a5b69321a0434d80f64a0f01bfae6709b1a1834cf12b44cba9c3fa93bfaddbc` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_tls / error | None / 200 | false | — | — | 26633 | 0 / None | — | ECONNRESET |

### Case 2

- Job ID: `e2a5773c0080ec6da5cf3ae3bb717f7453a5bf3bb1360bf4c4c73cfde998ae50`; event ID: `255f3e81-abac-4d89-867a-33f5d8a48649`.
- Thời điểm: **30/10/2026 01:46:54.692 ICT**; mức `read_retry`; retry đã ghi: `1`.
- Source: [https://www.facebook.com/groups/1186236945171145](https://www.facebook.com/groups/1186236945171145).
- Post: [https://www.facebook.com/1186236945171145_2683760122085479](https://www.facebook.com/1186236945171145_2683760122085479).
- Request route: `https://www.facebook.com/1186236945171145_2683760122085479`.
- elapsedMs=26789; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `95596101280f3fe35027a8c45359a828b7ef8262f3814efbf3d4224be8e7ecb4` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_tls / error | None / 200 | false | — | — | 26789 | 0 / None | — | ECONNRESET |

## G007 — facebook-reply / UPSTREAM_NETWORK_ERROR

`UPSTREAM_NETWORK_ERROR__PROXY_TLS__ECONNRESET__BOOTSTRAP__BOOTSTRAP`

Group key: `c7f2c80a959b1723ee5b0f3c192f75ea96b82461c7c7f74847a017af327bcd59`. Lần đầu 30/10/2026 00:47:28.594; lần cuối 30/10/2026 04:00:13.359.

**Số ghi nhận riêng từng mức:** RQ=5.663; RT=0; RF=0; JF=0. Tổng bản ghi quan sát=5.663.

**Quan sát:** Kết nối bị reset khi TLS tới origin qua proxy tunnel chưa hoàn tất; ở các case có CONNECT 200 thì tunnel HTTP đã được thiết lập, chưa có HTTP response của origin.

**Chưa biết/giới hạn:** Mã reset không xác định ai cắt: proxy, upstream, intermediary hay thay đổi đường truyền. Không phải reset khi đọc header/body.

**Hướng xử lý:** A/B có kiểm soát theo endpoint hash/target/operation, ghi peer/tunnel timing và trạng thái TLS; kiểm tra nhà cung cấp/đường CONNECT trước khi tăng worker. Không quarantine IP khi chưa có bằng chứng CONNECT-specific.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `proxy_tls` |
| originalReason | `UPSTREAM_NETWORK_ERROR` |
| nativeCode | `ECONNRESET` |
| connectStatus | `200` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `bootstrap` |
| query | `bootstrap` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `fc048f3fcb3e947b10d78bac91cfbd650a4a063bd4250ab3c01495886a31e924`; event ID: `c73fb527-f176-486f-835d-4f9cddad5361`.
- Thời điểm: **30/10/2026 01:36:11.272 ICT**; mức `request_error`; retry đã ghi: `0`.
- Source: [https://www.facebook.com/groups/262072201358367](https://www.facebook.com/groups/262072201358367).
- Post: [https://www.facebook.com/262072201358367_2214645172767717](https://www.facebook.com/262072201358367_2214645172767717).
- Request route: `https://www.facebook.com/262072201358367_2214645172767717`.
- elapsedMs=27078; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `69a81c8b5a5f0214f5716df7669560ea18ded4f5dbdab609d2bcaeb05aab8358` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_tls / error | None / 200 | false | — | — | 27078 | 0 / None | — | ECONNRESET |

### Case 2

- Job ID: `a8855bfe3f1a541844ca0de5a44c3357c342a78e6c3625f16a0afa9e7b1a95d2`; event ID: `0afc2ee3-2fa1-495a-8677-e990035b0f75`.
- Thời điểm: **30/10/2026 02:33:13.048 ICT**; mức `request_error`; retry đã ghi: `0`.
- Source: [https://www.facebook.com/groups/1075854446205899](https://www.facebook.com/groups/1075854446205899).
- Post: [https://www.facebook.com/1075854446205899_2787032695088057](https://www.facebook.com/1075854446205899_2787032695088057).
- Request route: `https://www.facebook.com/1075854446205899_2787032695088057`.
- elapsedMs=27059; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `b4aa5e353b18d757dec0bd61df049797b4ae99dd1254a9dc4a5bd4cca7f476e0` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_tls / error | None / 200 | false | — | — | 27059 | 0 / None | — | ECONNRESET |

## G008 — facebook-reply / NETWORK_ERROR

`NETWORK_ERROR__PROXY_TLS__ECONNRESET__BOOTSTRAP__BOOTSTRAP`

Group key: `cf43d3ee231c7c671be9bdd82f897028510c2b0fa517889a8f7bb79fd017296c`. Lần đầu 30/10/2026 00:47:28.990; lần cuối 30/10/2026 04:00:13.431.

**Số ghi nhận riêng từng mức:** RQ=0; RT=5.663; RF=0; JF=0. Tổng bản ghi quan sát=5.663.

**Quan sát:** Kết nối bị reset khi TLS tới origin qua proxy tunnel chưa hoàn tất; ở các case có CONNECT 200 thì tunnel HTTP đã được thiết lập, chưa có HTTP response của origin.

**Chưa biết/giới hạn:** Mã reset không xác định ai cắt: proxy, upstream, intermediary hay thay đổi đường truyền. Không phải reset khi đọc header/body.

**Hướng xử lý:** A/B có kiểm soát theo endpoint hash/target/operation, ghi peer/tunnel timing và trạng thái TLS; kiểm tra nhà cung cấp/đường CONNECT trước khi tăng worker. Không quarantine IP khi chưa có bằng chứng CONNECT-specific.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `proxy_tls` |
| originalReason | `NETWORK_ERROR` |
| nativeCode | `ECONNRESET` |
| connectStatus | `200` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `bootstrap` |
| query | `bootstrap` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `bcd3541f17c44f300f3c001c2bddf7ca10d2a0c175c2f0cd2cb5958320d8767e`; event ID: `cac78d8f-aae2-49e6-adc3-04bfb11c4d0e`.
- Thời điểm: **30/10/2026 01:52:16.953 ICT**; mức `read_retry`; retry đã ghi: `2`.
- Source: [https://www.facebook.com/groups/30533348352976027](https://www.facebook.com/groups/30533348352976027).
- Post: [https://www.facebook.com/30533348352976027_39412120725098701](https://www.facebook.com/30533348352976027_39412120725098701).
- Request route: `https://www.facebook.com/30533348352976027_39412120725098701`.
- elapsedMs=26434; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `95596101280f3fe35027a8c45359a828b7ef8262f3814efbf3d4224be8e7ecb4` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_tls / error | None / 200 | false | — | — | 26434 | 0 / None | — | ECONNRESET |

### Case 2

- Job ID: `0e251b106341a4e41d14faae604986d8efae713e805833e98d059cd33d2f5afd`; event ID: `3e18d8d0-6e80-467d-b846-1f5351edcd86`.
- Thời điểm: **30/10/2026 02:15:54.031 ICT**; mức `read_retry`; retry đã ghi: `2`.
- Source: [https://www.facebook.com/groups/1046176849114245](https://www.facebook.com/groups/1046176849114245).
- Post: [https://www.facebook.com/1046176849114245_2969936076738303](https://www.facebook.com/1046176849114245_2969936076738303).
- Request route: `https://www.facebook.com/1046176849114245_2969936076738303`.
- elapsedMs=27045; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `7a5bb6859e0af9e636659ef6abd4781c5af02fa367d61c5a79e089561a86ad6a` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_tls / error | None / 200 | false | — | — | 27045 | 0 / None | — | ECONNRESET |

## G009 — facebook-group-source / UPSTREAM_NETWORK_ERROR

`UPSTREAM_NETWORK_ERROR__PROXY_TLS__ECONNRESET__BOOTSTRAP__BOOTSTRAP`

Group key: `12b35c43e1e7ef658260193c2d47616d97736871806b91a3db1cb41b3ffe80f8`. Lần đầu 30/10/2026 00:47:18.334; lần cuối 30/10/2026 04:00:20.763.

**Số ghi nhận riêng từng mức:** RQ=4.540; RT=0; RF=0; JF=0. Tổng bản ghi quan sát=4.540.

**Quan sát:** Kết nối bị reset khi TLS tới origin qua proxy tunnel chưa hoàn tất; ở các case có CONNECT 200 thì tunnel HTTP đã được thiết lập, chưa có HTTP response của origin.

**Chưa biết/giới hạn:** Mã reset không xác định ai cắt: proxy, upstream, intermediary hay thay đổi đường truyền. Không phải reset khi đọc header/body.

**Hướng xử lý:** A/B có kiểm soát theo endpoint hash/target/operation, ghi peer/tunnel timing và trạng thái TLS; kiểm tra nhà cung cấp/đường CONNECT trước khi tăng worker. Không quarantine IP khi chưa có bằng chứng CONNECT-specific.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `proxy_tls` |
| originalReason | `UPSTREAM_NETWORK_ERROR` |
| nativeCode | `ECONNRESET` |
| connectStatus | `200` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `bootstrap` |
| query | `bootstrap` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `f2332249cad7a49d75f4a3044922b3b67c55d06bb2fc59c618ca7a27077d882c`; event ID: `b578a457-cbb2-4f62-b62f-422b9994da5a`.
- Thời điểm: **30/10/2026 01:11:54.009 ICT**; mức `request_error`; retry đã ghi: `0`.
- Source: [https://www.facebook.com/groups/2064557936972836](https://www.facebook.com/groups/2064557936972836).
- Request route: `https://www.facebook.com/groups/2064557936972836/`.
- elapsedMs=27227; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `ce4a66066f5431f40d815cc0ad4ebdaee32e61e699f1f4e78b685a830d4d8009` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_tls / error | None / 200 | false | — | — | 27227 | 0 / None | — | ECONNRESET |

### Case 2

- Job ID: `13c9c39d8df09dc565c18c13eb3e11ab67520cdf65105b3fde8700b2cb4829fb`; event ID: `3edd86c4-664d-4c86-bbdf-588ba8d91b4a`.
- Thời điểm: **30/10/2026 02:26:25.844 ICT**; mức `request_error`; retry đã ghi: `0`.
- Source: [https://www.facebook.com/groups/330273760871790](https://www.facebook.com/groups/330273760871790).
- Request route: `https://www.facebook.com/groups/330273760871790/`.
- elapsedMs=26442; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `8be8925c255ad041f858b4befba9866feaec30edaa6248b56910436f3a0815f8` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_tls / error | None / 200 | false | — | — | 26442 | 0 / None | — | ECONNRESET |

## G010 — facebook-group-source / NETWORK_ERROR

`NETWORK_ERROR__PROXY_TLS__ECONNRESET__BOOTSTRAP__BOOTSTRAP`

Group key: `17296a0d82c13af7258deddbe4ac48a074dc98cddb09bdf505fde7b9aadc09b4`. Lần đầu 30/10/2026 00:47:18.881; lần cuối 30/10/2026 04:00:19.345.

**Số ghi nhận riêng từng mức:** RQ=0; RT=4.539; RF=0; JF=0. Tổng bản ghi quan sát=4.539.

**Quan sát:** Kết nối bị reset khi TLS tới origin qua proxy tunnel chưa hoàn tất; ở các case có CONNECT 200 thì tunnel HTTP đã được thiết lập, chưa có HTTP response của origin.

**Chưa biết/giới hạn:** Mã reset không xác định ai cắt: proxy, upstream, intermediary hay thay đổi đường truyền. Không phải reset khi đọc header/body.

**Hướng xử lý:** A/B có kiểm soát theo endpoint hash/target/operation, ghi peer/tunnel timing và trạng thái TLS; kiểm tra nhà cung cấp/đường CONNECT trước khi tăng worker. Không quarantine IP khi chưa có bằng chứng CONNECT-specific.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `proxy_tls` |
| originalReason | `NETWORK_ERROR` |
| nativeCode | `ECONNRESET` |
| connectStatus | `200` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `bootstrap` |
| query | `bootstrap` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `ac769d3af4cf63ce3d42eb80e72ca92f6545c857521e95f3e254318f8edae3c9`; event ID: `075c60f4-cc0a-46c8-b5a9-198c6bcc521e`.
- Thời điểm: **30/10/2026 02:07:57.981 ICT**; mức `read_retry`; retry đã ghi: `1`.
- Source: [https://www.facebook.com/groups/289886632983904](https://www.facebook.com/groups/289886632983904).
- Request route: `https://www.facebook.com/groups/289886632983904/`.
- elapsedMs=27322; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `e6f397cb2ff59e4087b3932cfac8e3a813a0df748eb91ebf76ae58e6e0c59d71` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_tls / error | None / 200 | false | — | — | 27322 | 0 / None | — | ECONNRESET |

### Case 2

- Job ID: `5e8bb5fbe4e3ae8e6136b7f0d08c2b7898dea6a6e3358e2718d5cc7746d99579`; event ID: `00edfbda-54ff-4a2a-bd7c-849ba1822ff1`.
- Thời điểm: **30/10/2026 02:11:53.529 ICT**; mức `read_retry`; retry đã ghi: `1`.
- Source: [https://www.facebook.com/groups/2948957155116679](https://www.facebook.com/groups/2948957155116679).
- Request route: `https://www.facebook.com/groups/2948957155116679/`.
- elapsedMs=26598; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `95596101280f3fe35027a8c45359a828b7ef8262f3814efbf3d4224be8e7ecb4` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_tls / error | None / 200 | false | — | — | 26598 | 0 / None | — | ECONNRESET |

## G011 — facebook-page-source / NETWORK_ERROR

`NETWORK_ERROR__PROXY_TLS__ECONNRESET__BOOTSTRAP__BOOTSTRAP`

Group key: `84efaa0e9406cd33817b33e0501c0633004b922cdfdcf1603debe19c68c56b55`. Lần đầu 30/10/2026 00:47:18.311; lần cuối 30/10/2026 04:00:19.343.

**Số ghi nhận riêng từng mức:** RQ=0; RT=2.392; RF=0; JF=0. Tổng bản ghi quan sát=2.392.

**Quan sát:** Kết nối bị reset khi TLS tới origin qua proxy tunnel chưa hoàn tất; ở các case có CONNECT 200 thì tunnel HTTP đã được thiết lập, chưa có HTTP response của origin.

**Chưa biết/giới hạn:** Mã reset không xác định ai cắt: proxy, upstream, intermediary hay thay đổi đường truyền. Không phải reset khi đọc header/body.

**Hướng xử lý:** A/B có kiểm soát theo endpoint hash/target/operation, ghi peer/tunnel timing và trạng thái TLS; kiểm tra nhà cung cấp/đường CONNECT trước khi tăng worker. Không quarantine IP khi chưa có bằng chứng CONNECT-specific.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `proxy_tls` |
| originalReason | `NETWORK_ERROR` |
| nativeCode | `ECONNRESET` |
| connectStatus | `200` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `bootstrap` |
| query | `bootstrap` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `a843537a740a71892f2f48b8173d4f4de38372c8a5efb6d15efe49635c981a4a`; event ID: `395cf7d9-f155-440a-898c-4872bf8f514f`.
- Thời điểm: **30/10/2026 02:26:25.934 ICT**; mức `read_retry`; retry đã ghi: `1`.
- Source: [https://www.facebook.com/103715754403383](https://www.facebook.com/103715754403383).
- Request route: `https://www.facebook.com/100066151406770`.
- elapsedMs=26386; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `8be8925c255ad041f858b4befba9866feaec30edaa6248b56910436f3a0815f8` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_tls / error | None / 200 | false | — | — | 26386 | 0 / None | — | ECONNRESET |

### Case 2

- Job ID: `fb45e1050acd974451e58a6b2858e4a28cc2443bb88b1496dec225d65b21ac46`; event ID: `383fa868-70fb-41bf-b7c4-274e6e63b986`.
- Thời điểm: **30/10/2026 02:58:25.854 ICT**; mức `read_retry`; retry đã ghi: `1`.
- Source: [https://www.facebook.com/111994258198117](https://www.facebook.com/111994258198117).
- Request route: `https://www.facebook.com/100082988064339`.
- elapsedMs=29117; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `d315f663ead47476675cf7808b99870727ed7b681348e9e8f1d79de0860408e9` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_tls / error | None / 200 | false | — | — | 29117 | 0 / None | — | ECONNRESET |

## G012 — facebook-page-source / UPSTREAM_NETWORK_ERROR

`UPSTREAM_NETWORK_ERROR__PROXY_TLS__ECONNRESET__BOOTSTRAP__BOOTSTRAP`

Group key: `72a4b0cb7672fb10cabf5b058476148e2e71490dd679693c76c59ff94c8afed4`. Lần đầu 30/10/2026 00:47:17.599; lần cuối 30/10/2026 04:00:19.322.

**Số ghi nhận riêng từng mức:** RQ=2.392; RT=0; RF=0; JF=0. Tổng bản ghi quan sát=2.392.

**Quan sát:** Kết nối bị reset khi TLS tới origin qua proxy tunnel chưa hoàn tất; ở các case có CONNECT 200 thì tunnel HTTP đã được thiết lập, chưa có HTTP response của origin.

**Chưa biết/giới hạn:** Mã reset không xác định ai cắt: proxy, upstream, intermediary hay thay đổi đường truyền. Không phải reset khi đọc header/body.

**Hướng xử lý:** A/B có kiểm soát theo endpoint hash/target/operation, ghi peer/tunnel timing và trạng thái TLS; kiểm tra nhà cung cấp/đường CONNECT trước khi tăng worker. Không quarantine IP khi chưa có bằng chứng CONNECT-specific.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `proxy_tls` |
| originalReason | `UPSTREAM_NETWORK_ERROR` |
| nativeCode | `ECONNRESET` |
| connectStatus | `200` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `bootstrap` |
| query | `bootstrap` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `1e2b9b3877c3c6bd8493fe5712037ffa3317f85e20563070c32fa8c25cf4ceec`; event ID: `383e9aa0-d520-4b57-916a-4c00eb8b27dd`.
- Thời điểm: **30/10/2026 02:10:22.636 ICT**; mức `request_error`; retry đã ghi: `0`.
- Source: [https://www.facebook.com/1000944783433715](https://www.facebook.com/1000944783433715).
- Request route: `https://www.facebook.com/100066345285232`.
- elapsedMs=26530; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `632b7efa8c7957d1bc73e54ed16afbe3ab31063beb563ee539c83a3329320f45` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_tls / error | None / 200 | false | — | — | 26530 | 0 / None | — | ECONNRESET |

### Case 2

- Job ID: `9b69393e70bc2e576c4921bee492917d8eb4ee1abd72317fdbe236ab45f80219`; event ID: `b03b2eda-fefa-4dcc-8e3c-ee85172af6d3`.
- Thời điểm: **30/10/2026 02:49:46.783 ICT**; mức `request_error`; retry đã ghi: `0`.
- Source: [https://www.facebook.com/108914964813503](https://www.facebook.com/108914964813503).
- Request route: `https://www.facebook.com/100079090208117`.
- elapsedMs=27120; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `e49bb3d44b8077d1838aea4f7ae0d3974411f66264b335e4256af14bf034cef0` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_tls / error | None / 200 | false | — | — | 27120 | 0 / None | — | ECONNRESET |

## G013 — threads-comment / UPSTREAM_NETWORK_ERROR

`UPSTREAM_NETWORK_ERROR__PROXY_TLS__ECONNRESET__COMMENTS`

Group key: `5cef9c3bcf56fa5eb3cd85511cc99788b609c2afb8bacdeb935a5ccc563737d0`. Lần đầu 30/10/2026 00:47:20.650; lần cuối 30/10/2026 04:00:12.114.

**Số ghi nhận riêng từng mức:** RQ=1.135; RT=1.135; RF=0; JF=0. Tổng bản ghi quan sát=2.270.

**Quan sát:** Kết nối bị reset khi TLS tới origin qua proxy tunnel chưa hoàn tất; ở các case có CONNECT 200 thì tunnel HTTP đã được thiết lập, chưa có HTTP response của origin.

**Chưa biết/giới hạn:** Mã reset không xác định ai cắt: proxy, upstream, intermediary hay thay đổi đường truyền. Không phải reset khi đọc header/body.

**Hướng xử lý:** A/B có kiểm soát theo endpoint hash/target/operation, ghi peer/tunnel timing và trạng thái TLS; kiểm tra nhà cung cấp/đường CONNECT trước khi tăng worker. Không quarantine IP khi chưa có bằng chứng CONNECT-specific.

| Thuộc tính | Giá trị |
|---|---|
| platform | `threads` |
| phase | `proxy_tls` |
| originalReason | `UPSTREAM_NETWORK_ERROR` |
| nativeCode | `ECONNRESET` |
| connectStatus | `200` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `comments` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `cb42419b922ff083d993dce387c7ec61a2acedd736e9509c8d4980cd458863be`; event ID: `4ec17b67-3199-48f0-b255-6b5fc3093447`.
- Thời điểm: **30/10/2026 02:00:43.470 ICT**; mức `request_error`; retry đã ghi: `0`.
- Source: [https://www.threads.com/@dethuongphuong](https://www.threads.com/@dethuongphuong).
- Post: [https://www.threads.com/@dethuongphuong/post/DfEn5nTDwiK](https://www.threads.com/@dethuongphuong/post/DfEn5nTDwiK).
- Request route: `https://www.threads.com/@dethuongphuong/post/DfEn5nTDwiK`.
- elapsedMs=26445; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `632b7efa8c7957d1bc73e54ed16afbe3ab31063beb563ee539c83a3329320f45` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_tls / error | None / 200 | false | — | — | 26445 | 0 / None | — | ECONNRESET |

### Case 2

- Job ID: `babb71a3c4c3ae7e4f42d0867e56cf8340eeef96e5082802952f1cd733264b71`; event ID: `067d6dca-8df0-41b8-8390-362f0004fdae`.
- Thời điểm: **30/10/2026 02:42:46.799 ICT**; mức `request_error`; retry đã ghi: `0`.
- Source: [https://www.threads.com/@turtle.yt18](https://www.threads.com/@turtle.yt18).
- Post: [https://www.threads.com/@turtle.yt18/post/DfC6aW4DH-l](https://www.threads.com/@turtle.yt18/post/DfC6aW4DH-l).
- Request route: `https://www.threads.com/@turtle.yt18/post/DfC6aW4DH-l`.
- elapsedMs=27442; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `2becb4985e92d60fe4ef9e97d04f2f9c303e486e180844eaab3f716aae6f9533` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_tls / error | None / 200 | false | — | — | 27442 | 0 / None | — | ECONNRESET |

## G014 — youtube-source / UPSTREAM_NETWORK_ERROR

`UPSTREAM_NETWORK_ERROR__PROXY_TLS__ECONNRESET__SOURCE`

Group key: `df28af877ed1230c90e5e96b0bc188ca7eac23d7157fad471ab1f11375b37d56`. Lần đầu 30/10/2026 00:47:01.943; lần cuối 30/10/2026 04:00:12.509.

**Số ghi nhận riêng từng mức:** RQ=1.051; RT=1.049; RF=2; JF=0. Tổng bản ghi quan sát=2.102.

**Quan sát:** Kết nối bị reset khi TLS tới origin qua proxy tunnel chưa hoàn tất; ở các case có CONNECT 200 thì tunnel HTTP đã được thiết lập, chưa có HTTP response của origin.

**Chưa biết/giới hạn:** Mã reset không xác định ai cắt: proxy, upstream, intermediary hay thay đổi đường truyền. Không phải reset khi đọc header/body.

**Hướng xử lý:** A/B có kiểm soát theo endpoint hash/target/operation, ghi peer/tunnel timing và trạng thái TLS; kiểm tra nhà cung cấp/đường CONNECT trước khi tăng worker. Không quarantine IP khi chưa có bằng chứng CONNECT-specific.

| Thuộc tính | Giá trị |
|---|---|
| platform | `youtube` |
| phase | `proxy_tls` |
| originalReason | `UPSTREAM_NETWORK_ERROR` |
| nativeCode | `ECONNRESET` |
| connectStatus | `200` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `5d7adacd4988da0d66602c3ac9e6fd57d43da3180eb13a228c9cbb3696f373c9`; event ID: `d79d03ad-1692-4588-819b-05d1e095f03f`.
- Thời điểm: **30/10/2026 02:46:41.328 ICT**; mức `request_error`; retry đã ghi: `0`.
- Source: [https://www.youtube.com/channel/UCPx7XRmJCV2aSdh0SMhFZJg](https://www.youtube.com/channel/UCPx7XRmJCV2aSdh0SMhFZJg).
- Request route: `https://www.youtube.com/channel/UCPx7XRmJCV2aSdh0SMhFZJg/videos`.
- elapsedMs=11348; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `c4c496517ce8743ec78b17cde82ddaabe81613fdcdc6840d7f2346964decac75` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_tls / error | None / 200 | false | — | — | 11348 | 0 / None | — | ECONNRESET |

### Case 2

- Job ID: `174728b2e420c0f9ccf3b690aa540a11f0a54b57621b01740d97dbdbe8aa3137`; event ID: `99ad00cd-4be4-4e09-a6be-564504f22269`.
- Thời điểm: **30/10/2026 02:54:10.797 ICT**; mức `request_error`; retry đã ghi: `2`.
- Source: [https://www.youtube.com/channel/UCQ0jSGgYMLmRMeTE6UaPPXg](https://www.youtube.com/channel/UCQ0jSGgYMLmRMeTE6UaPPXg).
- Request route: `https://www.youtube.com/youtubei/v1/browse`.
- elapsedMs=11239; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `5cb681fe5ea3b2dea979e749d2e004dfe18a2bee66e973e220e95d431b0514df` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_tls / error | None / 200 | false | — | — | 11239 | 0 / None | — | ECONNRESET |

## G015 — instagram-comment / UPSTREAM_NETWORK_ERROR

`UPSTREAM_NETWORK_ERROR__PROXY_TLS__ECONNRESET__COMMENTS`

Group key: `70ec374ffe96ebcb1c6ffb4b063d3ed82d1691e6badafb016a4b76958c123b54`. Lần đầu 30/10/2026 00:47:17.596; lần cuối 30/10/2026 04:00:13.307.

**Số ghi nhận riêng từng mức:** RQ=955; RT=955; RF=0; JF=0. Tổng bản ghi quan sát=1.910.

**Quan sát:** Kết nối bị reset khi TLS tới origin qua proxy tunnel chưa hoàn tất; ở các case có CONNECT 200 thì tunnel HTTP đã được thiết lập, chưa có HTTP response của origin.

**Chưa biết/giới hạn:** Mã reset không xác định ai cắt: proxy, upstream, intermediary hay thay đổi đường truyền. Không phải reset khi đọc header/body.

**Hướng xử lý:** A/B có kiểm soát theo endpoint hash/target/operation, ghi peer/tunnel timing và trạng thái TLS; kiểm tra nhà cung cấp/đường CONNECT trước khi tăng worker. Không quarantine IP khi chưa có bằng chứng CONNECT-specific.

| Thuộc tính | Giá trị |
|---|---|
| platform | `instagram` |
| phase | `proxy_tls` |
| originalReason | `UPSTREAM_NETWORK_ERROR` |
| nativeCode | `ECONNRESET` |
| connectStatus | `200` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `comments` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `ca4586364b086be806882fd937c294798cf5adb29a9b829856c4cabb9e3e4980`; event ID: `7060c2ce-1d29-40d0-9ed9-1e4ba47208ac`.
- Thời điểm: **30/10/2026 01:08:56.110 ICT**; mức `request_error`; retry đã ghi: `0`.
- Source: [https://www.instagram.com/kevin.tonthien/](https://www.instagram.com/kevin.tonthien/).
- Post: [https://www.instagram.com/p/DfCuAFoGMDo/](https://www.instagram.com/p/DfCuAFoGMDo/).
- Request route: `https://www.instagram.com/p/DfCuAFoGMDo/`.
- elapsedMs=28001; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `ce4a66066f5431f40d815cc0ad4ebdaee32e61e699f1f4e78b685a830d4d8009` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_tls / error | None / 200 | false | — | — | 28001 | 0 / None | — | ECONNRESET |

### Case 2

- Job ID: `38e831be921adf051822083ab0b8cb18df01f3105f6c00253fa4ffd3f06172ab`; event ID: `bb709dac-f6cc-44a0-b2bc-9954cdd85cb7`.
- Thời điểm: **30/10/2026 02:42:50.240 ICT**; mức `request_error`; retry đã ghi: `0`.
- Source: [https://www.instagram.com/chelsfernandez_/](https://www.instagram.com/chelsfernandez_/).
- Post: [https://www.instagram.com/reel/DfFVc1wBm5G/](https://www.instagram.com/reel/DfFVc1wBm5G/).
- Request route: `https://www.instagram.com/reel/DfFVc1wBm5G/`.
- elapsedMs=26859; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `5cb681fe5ea3b2dea979e749d2e004dfe18a2bee66e973e220e95d431b0514df` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_tls / error | None / 200 | false | — | — | 26859 | 0 / None | — | ECONNRESET |

## G016 — facebook-page-source / AUTH_REQUIRED

`AUTH_REQUIRED__HTTP_RESPONSE__HTTP_200__BR__BOOTSTRAP__BOOTSTRAP`

Group key: `204778c4994a444ba56f007e9103276bc6fba16e4975a96a07cc9a695c4bf958`. Lần đầu 30/10/2026 00:46:53.562; lần cuối 30/10/2026 04:00:16.704.

**Số ghi nhận riêng từng mức:** RQ=0; RT=1.602; RF=308; JF=0. Tổng bản ghi quan sát=1.910.

**Quan sát:** HTTP 200 đã nhận đủ body; reader nhận diện nội dung yêu cầu đăng nhập tại bootstrap. Đây là cổng xác thực ở mức nội dung, không phải HTTP 401 hay reset socket.

**Chưa biết/giới hạn:** Toàn bộ mẫu auth trong cửa sổ có confirmed=false; một số xuất hiện sau khi đã có dữ liệu công khai. Chưa chứng minh source private, proxy bị chặn, hay template chắc chắn sai.

**Hướng xử lý:** Đối chiếu cùng source qua endpoint khác bằng phiên anonymous sạch và giữ dấu hiệu login/route đã khử bí mật. Tách trường hợp ban đầu với sau dữ liệu công khai; không gắn nhãn private chỉ từ login page.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `http_response` |
| originalReason | `AUTH_REQUIRED` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `200` |
| apiCode | `—` |
| operation | `bootstrap` |
| query | `bootstrap` |
| stage | `—` |
| bodyEncoding | `br` |
| wireComplete | `true` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `9f279589c8ebdfcf4cf7c83b09627d3ccd493f4095987b2fdfdee2a3cd4b95bd`; event ID: `5e24691e-55ae-4c04-be7c-5a8d5ddfae96`.
- Thời điểm: **30/10/2026 01:12:18.492 ICT**; mức `read_retry`; retry đã ghi: `2`.
- Source: [https://www.facebook.com/476061079399641](https://www.facebook.com/476061079399641).
- Request route: `—`.
- elapsedMs=12485; wireBytes=75627; decodedBytes=364847; wireComplete=true.
- Proxy endpoint hash: `1fbeb8474d73a6439b60037b69c1195e87ff741c1426c79cf23224b16b7f2c58` (không phải địa chỉ/credential proxy).
- Auth evidence: `{"classification": "login_after_public_data", "confirmed": false, "stage": "after_public_data", "evidence": "anonymous_login_or_checkpoint"}`.

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 302 / 200 | false | 2858 | 3782 | 16865 | 0 / None | true | — |
| 2 | complete / complete | 200 / None | true | 0 | 699 | 12485 | 75627 / 364847 | true | — |

### Case 2

- Job ID: `d3a846cd768139abd491c119810a23521d14a516e3257dafdda8a91b7d01a375`; event ID: `425aa0b6-2f4a-4c0d-802a-a75d7b736c30`.
- Thời điểm: **30/10/2026 03:24:48.212 ICT**; mức `read_retry`; retry đã ghi: `1`.
- Source: [https://www.facebook.com/159149310881264](https://www.facebook.com/159149310881264).
- Request route: `—`.
- elapsedMs=7386; wireBytes=76179; decodedBytes=365469; wireComplete=true.
- Proxy endpoint hash: `12fe8772934faddcc1651da315d774a0be9a423fe040d631ab848bf4531f0964` (không phải địa chỉ/credential proxy).
- Auth evidence: `{"classification": "unverified", "confirmed": false, "stage": "initial", "evidence": "anonymous_login_or_checkpoint"}`.

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 302 / 200 | false | 1820 | 2361 | 10355 | 0 / None | true | — |
| 2 | complete / complete | 200 / None | true | 0 | 643 | 7386 | 76179 / 365469 | true | — |

## G017 — facebook-user-source / UPSTREAM_NETWORK_ERROR

`UPSTREAM_NETWORK_ERROR__PROXY_TLS__ECONNRESET__BOOTSTRAP__BOOTSTRAP`

Group key: `c5da09d91c14124273eeb6162f353c8a5c17c5925cebf4a3c1994c17dd42e2d9`. Lần đầu 30/10/2026 00:47:18.902; lần cuối 30/10/2026 04:00:20.761.

**Số ghi nhận riêng từng mức:** RQ=1.418; RT=0; RF=0; JF=0. Tổng bản ghi quan sát=1.418.

**Quan sát:** Kết nối bị reset khi TLS tới origin qua proxy tunnel chưa hoàn tất; ở các case có CONNECT 200 thì tunnel HTTP đã được thiết lập, chưa có HTTP response của origin.

**Chưa biết/giới hạn:** Mã reset không xác định ai cắt: proxy, upstream, intermediary hay thay đổi đường truyền. Không phải reset khi đọc header/body.

**Hướng xử lý:** A/B có kiểm soát theo endpoint hash/target/operation, ghi peer/tunnel timing và trạng thái TLS; kiểm tra nhà cung cấp/đường CONNECT trước khi tăng worker. Không quarantine IP khi chưa có bằng chứng CONNECT-specific.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `proxy_tls` |
| originalReason | `UPSTREAM_NETWORK_ERROR` |
| nativeCode | `ECONNRESET` |
| connectStatus | `200` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `bootstrap` |
| query | `bootstrap` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `24bd9592607e540890f4f9156f6912dba330a024bfd544f0020391e30414e789`; event ID: `a5112322-5d9a-431d-aaf2-dab9cac0d74a`.
- Thời điểm: **30/10/2026 00:56:20.167 ICT**; mức `request_error`; retry đã ghi: `0`.
- Source: [https://www.facebook.com/1678742726](https://www.facebook.com/1678742726).
- Request route: `https://www.facebook.com/1678742726`.
- elapsedMs=26951; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `bf465100ec7fc0556b182ff0c9d3a95a488a290c56a2546f2ae66ce11182238c` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_tls / error | None / 200 | false | — | — | 26951 | 0 / None | — | ECONNRESET |

### Case 2

- Job ID: `fa8d062d65714336d29d951897e7066be05e6d93fc9df25526cf2930623ba1dd`; event ID: `039bb46e-fbe5-4a07-ab4b-3d87d3c84907`.
- Thời điểm: **30/10/2026 03:10:06.941 ICT**; mức `request_error`; retry đã ghi: `0`.
- Source: [https://www.facebook.com/100003173853758](https://www.facebook.com/100003173853758).
- Request route: `https://www.facebook.com/100003173853758`.
- elapsedMs=26438; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `dd03ca107d113c8c98e79730642743635fda075e9b4fc0d97d1344bda54bb466` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_tls / error | None / 200 | false | — | — | 26438 | 0 / None | — | ECONNRESET |

## G018 — facebook-user-source / NETWORK_ERROR

`NETWORK_ERROR__PROXY_TLS__ECONNRESET__BOOTSTRAP__BOOTSTRAP`

Group key: `7d95e95cec7df78fdb6bc0f8a714a13bd4e84ecde8a12017c32eda7465bb9113`. Lần đầu 30/10/2026 00:47:19.626; lần cuối 30/10/2026 04:00:18.241.

**Số ghi nhận riêng từng mức:** RQ=0; RT=1.417; RF=0; JF=0. Tổng bản ghi quan sát=1.417.

**Quan sát:** Kết nối bị reset khi TLS tới origin qua proxy tunnel chưa hoàn tất; ở các case có CONNECT 200 thì tunnel HTTP đã được thiết lập, chưa có HTTP response của origin.

**Chưa biết/giới hạn:** Mã reset không xác định ai cắt: proxy, upstream, intermediary hay thay đổi đường truyền. Không phải reset khi đọc header/body.

**Hướng xử lý:** A/B có kiểm soát theo endpoint hash/target/operation, ghi peer/tunnel timing và trạng thái TLS; kiểm tra nhà cung cấp/đường CONNECT trước khi tăng worker. Không quarantine IP khi chưa có bằng chứng CONNECT-specific.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `proxy_tls` |
| originalReason | `NETWORK_ERROR` |
| nativeCode | `ECONNRESET` |
| connectStatus | `200` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `bootstrap` |
| query | `bootstrap` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `a02ebcc9349430dfc3895dfd29b37f8bd315f0ee3ad91c6f438392d24b5c61fd`; event ID: `88d82cc7-0d53-4113-b514-db3b59acae03`.
- Thời điểm: **30/10/2026 02:23:59.062 ICT**; mức `read_retry`; retry đã ghi: `1`.
- Source: [https://www.facebook.com/100000578800959](https://www.facebook.com/100000578800959).
- Request route: `https://www.facebook.com/100000578800959`.
- elapsedMs=26644; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `b4aa5e353b18d757dec0bd61df049797b4ae99dd1254a9dc4a5bd4cca7f476e0` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_tls / error | None / 200 | false | — | — | 26644 | 0 / None | — | ECONNRESET |

### Case 2

- Job ID: `29f5ec4afe8d9bda67db21db6039a3f679177768f5364bf00c18935ba74c25e9`; event ID: `81e30625-227d-4c72-86a7-3cce088c7e15`.
- Thời điểm: **30/10/2026 02:30:52.818 ICT**; mức `read_retry`; retry đã ghi: `2`.
- Source: [https://www.facebook.com/100001141662653](https://www.facebook.com/100001141662653).
- Request route: `https://www.facebook.com/100001141662653`.
- elapsedMs=27182; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `e49bb3d44b8077d1838aea4f7ae0d3974411f66264b335e4256af14bf034cef0` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_tls / error | None / 200 | false | — | — | 27182 | 0 / None | — | ECONNRESET |

## G019 — facebook-group-source / UPSTREAM_TIMEOUT

`UPSTREAM_TIMEOUT__UNOBSERVED__SOURCE`

Group key: `08dd40ff1fdacf8d6a2acf162fbc95d992a26f286f0e105ccde3d01c9785ba7d`. Lần đầu 30/10/2026 00:49:50.186; lần cuối 30/10/2026 04:00:00.305.

**Số ghi nhận riêng từng mức:** RQ=0; RT=1.339; RF=0; JF=0. Tổng bản ghi quan sát=1.339.

**Quan sát:** Hết thời gian của lượt đọc, nhưng không có networkTimings để định vị đến DNS/CONNECT/TLS/header/body.

**Chưa biết/giới hạn:** UPSTREAM_TIMEOUT là mã tổng hợp của ứng dụng; không phải bằng chứng native ETIMEDOUT. Không có elapsedMs ở các case này.

**Hướng xử lý:** Bổ sung trace trước acquisition/permit/request và giữ timing khi dispose/timeout. Giữ nhóm UNOBSERVED riêng; dùng job ID/cursor của case để tái hiện, không gán nguyên nhân cho proxy.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `unobserved` |
| originalReason | `UPSTREAM_TIMEOUT` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `—` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `b4bd026a84054a614130219cad27f31ca25fea8febd940b5f7c2e4ed78a768bf`; event ID: `469ff9fe-72cb-416d-9df9-9fb91e6d27b2`.
- Thời điểm: **30/10/2026 01:07:15.153 ICT**; mức `read_retry`; retry đã ghi: `3`.
- Source: [https://www.facebook.com/groups/1995826307295727](https://www.facebook.com/groups/1995826307295727).
- Request route: `—`.
- elapsedMs=—; wireBytes=—; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `d315f663ead47476675cf7808b99870727ed7b681348e9e8f1d79de0860408e9` (không phải địa chỉ/credential proxy).

Không có wire timing trong case này; không suy đoán DNS/TCP/TLS/HTTP stage từ elapsed bị thiếu.

### Case 2

- Job ID: `760131badab4463bce3a1ac674c1faf6df0e74d4218fec2a681f20f442b7d6bc`; event ID: `cf6eb7ea-4f75-4e2e-a872-3d08b32d072b`.
- Thời điểm: **30/10/2026 01:49:10.411 ICT**; mức `read_retry`; retry đã ghi: `4`.
- Source: [https://www.facebook.com/groups/249952573168871](https://www.facebook.com/groups/249952573168871).
- Request route: `—`.
- elapsedMs=—; wireBytes=—; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `840bd17f4157c8e00bb17a0c9abf91aa3a9ca5c8a821253b1fae93d37bf51400` (không phải địa chỉ/credential proxy).

Không có wire timing trong case này; không suy đoán DNS/TCP/TLS/HTTP stage từ elapsed bị thiếu.

## G020 — threads-source / ECONNRESET

`ECONNRESET__PROXY_TLS__ECONNRESET__SOURCE`

Group key: `555c92c1adb47eda15a553b25e492f48b99a0e5a9ca4c15262ae0b88059b63cb`. Lần đầu 30/10/2026 00:47:20.627; lần cuối 30/10/2026 04:00:12.113.

**Số ghi nhận riêng từng mức:** RQ=0; RT=1.280; RF=0; JF=0. Tổng bản ghi quan sát=1.280.

**Quan sát:** Kết nối bị reset khi TLS tới origin qua proxy tunnel chưa hoàn tất; ở các case có CONNECT 200 thì tunnel HTTP đã được thiết lập, chưa có HTTP response của origin.

**Chưa biết/giới hạn:** Mã reset không xác định ai cắt: proxy, upstream, intermediary hay thay đổi đường truyền. Không phải reset khi đọc header/body.

**Hướng xử lý:** A/B có kiểm soát theo endpoint hash/target/operation, ghi peer/tunnel timing và trạng thái TLS; kiểm tra nhà cung cấp/đường CONNECT trước khi tăng worker. Không quarantine IP khi chưa có bằng chứng CONNECT-specific.

| Thuộc tính | Giá trị |
|---|---|
| platform | `threads` |
| phase | `proxy_tls` |
| originalReason | `ECONNRESET` |
| nativeCode | `ECONNRESET` |
| connectStatus | `200` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `e6120c51c70528c5a15ed50e01ac85c60c3f7ac642acc7fe752cd7a2893c2562`; event ID: `d016d20a-4477-4237-8f8e-dedb0cb09ea8`.
- Thời điểm: **30/10/2026 01:44:51.380 ICT**; mức `read_retry`; retry đã ghi: `1`.
- Source: [https://www.threads.com/@nghiaa_bii](https://www.threads.com/@nghiaa_bii).
- Request route: `https://www.threads.com/@nghiaa_bii`.
- elapsedMs=26568; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `69a81c8b5a5f0214f5716df7669560ea18ded4f5dbdab609d2bcaeb05aab8358` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_tls / error | None / 200 | false | — | — | 26568 | 0 / None | — | ECONNRESET |

### Case 2

- Job ID: `353b999f098c8585f46f8f0ec9dd9551ca459c732d344b20346e2ef35db3ea61`; event ID: `e626b5ef-fed1-44a1-8e8c-3a127e882035`.
- Thời điểm: **30/10/2026 02:07:07.635 ICT**; mức `read_retry`; retry đã ghi: `1`.
- Source: [https://www.threads.com/@boyvuitinh_](https://www.threads.com/@boyvuitinh_).
- Request route: `https://www.threads.com/@boyvuitinh_`.
- elapsedMs=26823; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `7a5bb6859e0af9e636659ef6abd4781c5af02fa367d61c5a79e089561a86ad6a` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_tls / error | None / 200 | false | — | — | 26823 | 0 / None | — | ECONNRESET |

## G021 — threads-source / UPSTREAM_NETWORK_ERROR

`UPSTREAM_NETWORK_ERROR__PROXY_TLS__ECONNRESET__SOURCE`

Group key: `2a4b2907a5e7e06613e7f217f40b855fac96b9890228286936ee801d8afc6f2e`. Lần đầu 30/10/2026 00:47:20.434; lần cuối 30/10/2026 04:00:11.966.

**Số ghi nhận riêng từng mức:** RQ=1.280; RT=0; RF=0; JF=0. Tổng bản ghi quan sát=1.280.

**Quan sát:** Kết nối bị reset khi TLS tới origin qua proxy tunnel chưa hoàn tất; ở các case có CONNECT 200 thì tunnel HTTP đã được thiết lập, chưa có HTTP response của origin.

**Chưa biết/giới hạn:** Mã reset không xác định ai cắt: proxy, upstream, intermediary hay thay đổi đường truyền. Không phải reset khi đọc header/body.

**Hướng xử lý:** A/B có kiểm soát theo endpoint hash/target/operation, ghi peer/tunnel timing và trạng thái TLS; kiểm tra nhà cung cấp/đường CONNECT trước khi tăng worker. Không quarantine IP khi chưa có bằng chứng CONNECT-specific.

| Thuộc tính | Giá trị |
|---|---|
| platform | `threads` |
| phase | `proxy_tls` |
| originalReason | `UPSTREAM_NETWORK_ERROR` |
| nativeCode | `ECONNRESET` |
| connectStatus | `200` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `b68b91ae7257659f62c9529cc516d38fc076c3b2173c1ea430a4a3e2ab61a3ab`; event ID: `4105f3ec-aa12-40b8-8840-6014adc4f1b3`.
- Thời điểm: **30/10/2026 01:18:13.349 ICT**; mức `request_error`; retry đã ghi: `0`.
- Source: [https://www.threads.com/@hoangmai24913](https://www.threads.com/@hoangmai24913).
- Request route: `https://www.threads.com/@hoangmai24913`.
- elapsedMs=27079; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `cb55289f5b8ad84994086136c79263e50311c9718d73a7c1afd46f69fcfc4916` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_tls / error | None / 200 | false | — | — | 27079 | 0 / None | — | ECONNRESET |

### Case 2

- Job ID: `26d913e182a1287e5cf65f9ccfe28a28fe5f19a2c6dc762b2304c4d8823568d0`; event ID: `cc79c5e5-da80-49c2-98c0-fca39da7d05c`.
- Thời điểm: **30/10/2026 03:15:20.231 ICT**; mức `request_error`; retry đã ghi: `0`.
- Source: [https://www.threads.com/@tiem_an_chika](https://www.threads.com/@tiem_an_chika).
- Request route: `https://www.threads.com/@tiem_an_chika`.
- elapsedMs=26445; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `0a756cc5269ddfeca9187549e4546bd9c970856378e8dd1409becf11b3d9a818` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_tls / error | None / 200 | false | — | — | 26445 | 0 / None | — | ECONNRESET |

## G022 — find-uid / FACEBOOK_PROFILE_UID_NOT_RETURNED

`FACEBOOK_PROFILE_UID_NOT_RETURNED__UID_LOOKUP__LOCAL_CURL_PROFILE__UNRECOVERABLEERROR`

Group key: `85e33e94b339a817e5f53e889bfc599cf59e6d641628199f32055a60e002b87c`. Lần đầu 30/10/2026 00:47:50.232; lần cuối 30/10/2026 04:00:19.895.

**Số ghi nhận riêng từng mức:** RQ=0; RT=0; RF=0; JF=1.226. Tổng bản ghi quan sát=1.226.

**Quan sát:** Worker UID không thu được numeric author ID có bằng chứng khớp chính profile. Theo nhánh code, phản hồi profile phải là HTTP 200 mới ra mã này; telemetry của lỗi này chưa lưu riêng status/response hash.

**Chưa biết/giới hạn:** Không có failed-response snapshot nên chưa phân biệt được schema profile mới, thiếu preload, route khác hoặc nội dung không cung cấp UID. Không chứng minh author bị xóa hay tài khoản riêng tư.

**Hướng xử lý:** Kiểm tra hai profile opaque trong case, ghi response hash/canonical route/số UID candidate của snapshot fail; đối chiếu parser profileUidFromSnapshot và fallback GraphQL có sẵn. Chỉ dùng UID có bằng chứng, không lấy siteId/parentId làm authorId.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `uid_lookup` |
| originalReason | `FACEBOOK_PROFILE_UID_NOT_RETURNED` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `local_curl_profile` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `—` |
| syscall | `—` |
| errorType | `UnrecoverableError` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `e59f20bf6bf3c2c0ebbcf898afaff31a88f38a69acce32af5d998474e2509bc7`; event ID: `fb2f68c32e5040b8f2ba763281c0f4b358ab97b851747d190744ce9f94dabfd8`.
- Thời điểm: **30/10/2026 02:53:17.596 ICT**; mức `job_failed`; retry đã ghi: `—`.
- Source: [https://www.facebook.com/groups/1545294632435900](https://www.facebook.com/groups/1545294632435900).
- Post: [https://www.facebook.com/1545294632435900_4261362324162437](https://www.facebook.com/1545294632435900_4261362324162437).
- Request route: `—`.
- elapsedMs=—; wireBytes=—; decodedBytes=—; wireComplete=—.
- Author payload: id=`—`, opaqueId=`pfbid033poRoy8fvovh6SbzK1DDyc641fekin28gQS6yRHTargACagoGg9hVWbeHVJp3jwql`, profileUrl=`—`.
- Profile lookup suy ra đúng hàm uidLookupUrl: [facebook.com/pfbid033poRoy8fvovh6SbzK1DDyc641fekin28gQS6yRHTargACagoGg9hVWbeHVJp3jwql](https://www.facebook.com/pfbid033poRoy8fvovh6SbzK1DDyc641fekin28gQS6yRHTargACagoGg9hVWbeHVJp3jwql).

Không có wire timing trong case này; không suy đoán DNS/TCP/TLS/HTTP stage từ elapsed bị thiếu.

Stack frame đã bỏ message/body:
- `at requestProfile (file:///Users/phuctran/Workspace/crawler-2026/scripts/local_find_uid_worker.mjs:56:18)`
- `at process.processTicksAndRejections (node:internal/process/task_queues:95:5)`
- `at async lookup (file:///Users/phuctran/Workspace/crawler-2026/scripts/local_find_uid_worker.mjs:74:18)`
- `at async Worker.connection [as processFn] (file:///Users/phuctran/Workspace/crawler-2026/scripts/local_find_uid_worker.mjs:81:15)`

### Case 2

- Job ID: `610cb548e1533ec0c8761d277782ac5ea9607677534ac98b6cd5173d2341efaa`; event ID: `58221e7fb5a9e16bb89cc58d43abd4ec09c0d667f478faa98b6236bee8fa1e99`.
- Thời điểm: **30/10/2026 03:10:29.515 ICT**; mức `job_failed`; retry đã ghi: `—`.
- Source: [https://www.facebook.com/groups/1722555588011917](https://www.facebook.com/groups/1722555588011917).
- Post: [https://www.facebook.com/1722555588011917_4521654268102021](https://www.facebook.com/1722555588011917_4521654268102021).
- Request route: `—`.
- elapsedMs=—; wireBytes=—; decodedBytes=—; wireComplete=—.
- Author payload: id=`—`, opaqueId=`pfbid066BbhTWyTfNhMiAnxAuR2djUgKVo2CYaaRQmi4yADb3jP3iKH58A59An68VbMC1jl`, profileUrl=`—`.
- Profile lookup suy ra đúng hàm uidLookupUrl: [facebook.com/pfbid066BbhTWyTfNhMiAnxAuR2djUgKVo2CYaaRQmi4yADb3jP3iKH58A59An68VbMC1jl](https://www.facebook.com/pfbid066BbhTWyTfNhMiAnxAuR2djUgKVo2CYaaRQmi4yADb3jP3iKH58A59An68VbMC1jl).

Không có wire timing trong case này; không suy đoán DNS/TCP/TLS/HTTP stage từ elapsed bị thiếu.

Stack frame đã bỏ message/body:
- `at requestProfile (file:///Users/phuctran/Workspace/crawler-2026/scripts/local_find_uid_worker.mjs:56:18)`
- `at process.processTicksAndRejections (node:internal/process/task_queues:95:5)`
- `at async lookup (file:///Users/phuctran/Workspace/crawler-2026/scripts/local_find_uid_worker.mjs:74:18)`
- `at async Worker.connection [as processFn] (file:///Users/phuctran/Workspace/crawler-2026/scripts/local_find_uid_worker.mjs:81:15)`

## G023 — facebook-comment / FACEBOOK_RATE_LIMITED

`FACEBOOK_RATE_LIMITED__HTTP_RESPONSE__HTTP_200__API_1675004__BR__COMMENTS__COMMENTLISTCOMPONENTSROOTQUERY`

Group key: `e570dfabe8ddd5d0e6749d88a1cd77b0c017ccb2fd01e4786a1e68a891e13b38`. Lần đầu 30/10/2026 00:47:06.102; lần cuối 30/10/2026 03:57:42.221.

**Số ghi nhận riêng từng mức:** RQ=0; RT=1.193; RF=0; JF=0. Tổng bản ghi quan sát=1.193.

**Quan sát:** Facebook GraphQL trả lỗi được reader phân loại rate limit bên trong HTTP 200; native API code được giữ là 1675004, query CommentListComponentsRootQuery.

**Chưa biết/giới hạn:** Chưa giữ native message chi tiết, nên không gán nghĩa mở rộng cho riêng mã 1675004 ngoài classifier hiện tại; không phải HTTP 429.

**Hướng xử lý:** Đối chiếu native error envelope/query và áp lực theo operation. Xác nhận cách chờ/Retry-After phù hợp trước khi đổi policy; không xem tất cả là lỗi TCP/TLS.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `http_response` |
| originalReason | `FACEBOOK_RATE_LIMITED` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `200` |
| apiCode | `1675004` |
| operation | `comments` |
| query | `CommentListComponentsRootQuery` |
| stage | `—` |
| bodyEncoding | `br` |
| wireComplete | `true` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `52f4df361a36f00f15157afa9ecb17bb5cfb63dc6c37424f7e68979f5302b18f`; event ID: `f863e58d-5c50-4982-a5c9-7878444c9dfe`.
- Thời điểm: **30/10/2026 02:06:55.752 ICT**; mức `read_retry`; retry đã ghi: `1`.
- Source: [https://www.facebook.com/groups/132684678951352](https://www.facebook.com/groups/132684678951352).
- Post: [https://www.facebook.com/132684678951352_1420305966855877](https://www.facebook.com/132684678951352_1420305966855877).
- Request route: `—`.
- elapsedMs=1183; wireBytes=104; decodedBytes=114; wireComplete=true.
- Proxy endpoint hash: `f0154747fd463a4eaa4d1cb4e5d512b2e68a2b89e62fc66699afb69b8ea8864d` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 301 / 200 | false | 1660 | 2281 | 16525 | 0 / None | true | — |
| 2 | complete / complete | 200 / None | true | 0 | 1096 | 13806 | 169649 / 1099553 | true | — |
| 3 | complete / complete | 200 / None | true | 0 | 841 | 1183 | 104 / 114 | true | — |

### Case 2

- Job ID: `475813bc10af4ab14ec88c6ecaf9a0a769e4f4ed6d25967469adc818001d9307`; event ID: `153da7ea-bb00-4575-8bec-b51d8d74f6b8`.
- Thời điểm: **30/10/2026 02:46:02.125 ICT**; mức `read_retry`; retry đã ghi: `1`.
- Source: [https://www.facebook.com/groups/1529930057206010](https://www.facebook.com/groups/1529930057206010).
- Post: [https://www.facebook.com/1529930057206010_3290926917772973](https://www.facebook.com/1529930057206010_3290926917772973).
- Request route: `—`.
- elapsedMs=1600; wireBytes=104; decodedBytes=114; wireComplete=true.
- Proxy endpoint hash: `7d730d63405f07f751675db935187f1ecab6b7f2cf0c336fd977304ca6d2c70e` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 301 / 200 | false | 1456 | 1919 | 24176 | 0 / None | true | — |
| 2 | complete / complete | 200 / None | true | 0 | 1373 | 21881 | 142254 / 906693 | true | — |
| 3 | complete / complete | 200 / None | true | 1 | 1201 | 1600 | 104 / 114 | true | — |

## G024 — instagram-source / ECONNRESET

`ECONNRESET__PROXY_TLS__ECONNRESET__SOURCE`

Group key: `7a8c922b16c7cf7c8a1cfc02b9f6d7fc7d2380a2d753f687b5243e39c5c4d734`. Lần đầu 30/10/2026 00:48:00.528; lần cuối 30/10/2026 04:00:11.093.

**Số ghi nhận riêng từng mức:** RQ=0; RT=988; RF=0; JF=0. Tổng bản ghi quan sát=988.

**Quan sát:** Kết nối bị reset khi TLS tới origin qua proxy tunnel chưa hoàn tất; ở các case có CONNECT 200 thì tunnel HTTP đã được thiết lập, chưa có HTTP response của origin.

**Chưa biết/giới hạn:** Mã reset không xác định ai cắt: proxy, upstream, intermediary hay thay đổi đường truyền. Không phải reset khi đọc header/body.

**Hướng xử lý:** A/B có kiểm soát theo endpoint hash/target/operation, ghi peer/tunnel timing và trạng thái TLS; kiểm tra nhà cung cấp/đường CONNECT trước khi tăng worker. Không quarantine IP khi chưa có bằng chứng CONNECT-specific.

| Thuộc tính | Giá trị |
|---|---|
| platform | `instagram` |
| phase | `proxy_tls` |
| originalReason | `ECONNRESET` |
| nativeCode | `ECONNRESET` |
| connectStatus | `200` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `dc987c74dc38e4fa086dc36bcb43e54155a2b2248558f680a4cbf274d412010c`; event ID: `b6b37580-d605-4885-b3dd-44230d7c3609`.
- Thời điểm: **30/10/2026 02:52:14.408 ICT**; mức `read_retry`; retry đã ghi: `1`.
- Source: [https://www.instagram.com/kfc_vietnam/](https://www.instagram.com/kfc_vietnam/).
- Request route: `https://www.instagram.com/kfc_vietnam/`.
- elapsedMs=27024; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `5cb681fe5ea3b2dea979e749d2e004dfe18a2bee66e973e220e95d431b0514df` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_tls / error | None / 200 | false | — | — | 27024 | 0 / None | — | ECONNRESET |

### Case 2

- Job ID: `264e13e2eeeaa88e29c4504436b7d77c54bdcdac2c1f7dd7f6b49fc0fb6f449e`; event ID: `9430cc3b-97b3-4e36-93e3-e3e1c698a2b1`.
- Thời điểm: **30/10/2026 02:59:23.013 ICT**; mức `read_retry`; retry đã ghi: `1`.
- Source: [https://www.instagram.com/newsphinx.beerbar/](https://www.instagram.com/newsphinx.beerbar/).
- Request route: `https://www.instagram.com/newsphinx.beerbar/`.
- elapsedMs=26113; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `f0154747fd463a4eaa4d1cb4e5d512b2e68a2b89e62fc66699afb69b8ea8864d` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_tls / error | None / 200 | false | — | — | 26113 | 0 / None | — | ECONNRESET |

## G025 — instagram-source / UPSTREAM_NETWORK_ERROR

`UPSTREAM_NETWORK_ERROR__PROXY_TLS__ECONNRESET__SOURCE`

Group key: `3fdeda1242f7023644bb09b2b360724741c02ef973e88d138c4b42d8b94cfe62`. Lần đầu 30/10/2026 00:48:00.409; lần cuối 30/10/2026 04:00:10.975.

**Số ghi nhận riêng từng mức:** RQ=988; RT=0; RF=0; JF=0. Tổng bản ghi quan sát=988.

**Quan sát:** Kết nối bị reset khi TLS tới origin qua proxy tunnel chưa hoàn tất; ở các case có CONNECT 200 thì tunnel HTTP đã được thiết lập, chưa có HTTP response của origin.

**Chưa biết/giới hạn:** Mã reset không xác định ai cắt: proxy, upstream, intermediary hay thay đổi đường truyền. Không phải reset khi đọc header/body.

**Hướng xử lý:** A/B có kiểm soát theo endpoint hash/target/operation, ghi peer/tunnel timing và trạng thái TLS; kiểm tra nhà cung cấp/đường CONNECT trước khi tăng worker. Không quarantine IP khi chưa có bằng chứng CONNECT-specific.

| Thuộc tính | Giá trị |
|---|---|
| platform | `instagram` |
| phase | `proxy_tls` |
| originalReason | `UPSTREAM_NETWORK_ERROR` |
| nativeCode | `ECONNRESET` |
| connectStatus | `200` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `f8046ef7ab3039d18fad98fcba3ff772bb3a7d0961ce7b050f5c47c6e14372ca`; event ID: `cbcf475a-c76e-4ce1-8ac9-27618f7a2048`.
- Thời điểm: **30/10/2026 01:10:56.252 ICT**; mức `request_error`; retry đã ghi: `0`.
- Source: [https://www.instagram.com/yakinikulike.vn/](https://www.instagram.com/yakinikulike.vn/).
- Request route: `https://www.instagram.com/yakinikulike.vn/`.
- elapsedMs=26757; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `cb55289f5b8ad84994086136c79263e50311c9718d73a7c1afd46f69fcfc4916` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_tls / error | None / 200 | false | — | — | 26757 | 0 / None | — | ECONNRESET |

### Case 2

- Job ID: `38d458e9b6cc7a153548a489343de5280fc90be5ac794c19738714e1fa5c9cef`; event ID: `98cd7c35-d386-449a-9b7f-460436b91e52`.
- Thời điểm: **30/10/2026 01:22:26.860 ICT**; mức `request_error`; retry đã ghi: `0`.
- Source: [https://www.instagram.com/hhennie.official/](https://www.instagram.com/hhennie.official/).
- Request route: `https://www.instagram.com/hhennie.official/`.
- elapsedMs=27207; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `cb55289f5b8ad84994086136c79263e50311c9718d73a7c1afd46f69fcfc4916` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_tls / error | None / 200 | false | — | — | 27207 | 0 / None | — | ECONNRESET |

## G026 — facebook-comment / NETWORK_ERROR

`NETWORK_ERROR__PROXY_CONNECT__BOOTSTRAP__BOOTSTRAP`

Group key: `24266c6f0a6f962e93d0c6d2e8296579e5a3df9bc4eb80e19207366991c01df2`. Lần đầu 30/10/2026 00:57:40.434; lần cuối 30/10/2026 04:00:13.171.

**Số ghi nhận riêng từng mức:** RQ=0; RT=932; RF=0; JF=0. Tổng bản ghi quan sát=932.

**Quan sát:** Thất bại trước khi ghi nhận CONNECT hoàn tất/socket origin. Không có nativeCode và chưa có HTTP status ở các case mẫu.

**Chưa biết/giới hạn:** Chưa phân biệt được DNS tới proxy, TCP tới proxy, đóng sớm hay timeout tunnel. Tuyệt đối không đổi nhóm này thành ECONNRESET.

**Hướng xử lý:** Bổ sung cause.code/errno/syscall và timing DNS/TCP/CONNECT của agent; kiểm tra proxy-manager/provider log theo endpoint hash và giờ case.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `proxy_connect` |
| originalReason | `NETWORK_ERROR` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `bootstrap` |
| query | `bootstrap` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `1441c77cbc5e3cfc9abc1c834aea9524cc818daf439c2fa5bdcb58cac3976aa8`; event ID: `a17cfe21-d018-4ab2-a971-3a5a69fbafc3`.
- Thời điểm: **30/10/2026 03:34:08.622 ICT**; mức `read_retry`; retry đã ghi: `3`.
- Source: [https://www.facebook.com/groups/1921047868192571](https://www.facebook.com/groups/1921047868192571).
- Post: [https://www.facebook.com/1921047868192571_4184521208511881](https://www.facebook.com/1921047868192571_4184521208511881).
- Request route: `https://www.facebook.com/1921047868192571_4184521208511881`.
- elapsedMs=20914; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `01a01fd0e59c6a8b21005bfea6b6b918dde95729dadb2b3e9f73a7202e51cbc2` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_connect / error | None / None | false | — | — | 20914 | 0 / None | — | — |

### Case 2

- Job ID: `ba7fd5328017cad8e88dc3f200ac726ca8eea01e8a57ed9d66fcde5d18157d23`; event ID: `53de14ad-be21-48d7-8da3-c9cb73e91fff`.
- Thời điểm: **30/10/2026 03:58:55.054 ICT**; mức `read_retry`; retry đã ghi: `2`.
- Source: [https://www.facebook.com/groups/215763290347711](https://www.facebook.com/groups/215763290347711).
- Post: [https://www.facebook.com/215763290347711_1629074855683207](https://www.facebook.com/215763290347711_1629074855683207).
- Request route: `https://www.facebook.com/215763290347711_1629074855683207`.
- elapsedMs=20646; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `04008c14c6432cfd675d31322da8f6f3a9968c5f7b630ce1212c5f7335a8e408` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_connect / error | None / None | false | — | — | 20646 | 0 / None | — | — |

## G027 — facebook-comment / UPSTREAM_NETWORK_ERROR

`UPSTREAM_NETWORK_ERROR__PROXY_CONNECT__BOOTSTRAP__BOOTSTRAP`

Group key: `e0a022fddce7298cabd7c655225ac8bb6b71d04ea1aa0b394bb6e4f4a60bba0b`. Lần đầu 30/10/2026 00:57:40.340; lần cuối 30/10/2026 04:00:12.862.

**Số ghi nhận riêng từng mức:** RQ=932; RT=0; RF=0; JF=0. Tổng bản ghi quan sát=932.

**Quan sát:** Thất bại trước khi ghi nhận CONNECT hoàn tất/socket origin. Không có nativeCode và chưa có HTTP status ở các case mẫu.

**Chưa biết/giới hạn:** Chưa phân biệt được DNS tới proxy, TCP tới proxy, đóng sớm hay timeout tunnel. Tuyệt đối không đổi nhóm này thành ECONNRESET.

**Hướng xử lý:** Bổ sung cause.code/errno/syscall và timing DNS/TCP/CONNECT của agent; kiểm tra proxy-manager/provider log theo endpoint hash và giờ case.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `proxy_connect` |
| originalReason | `UPSTREAM_NETWORK_ERROR` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `bootstrap` |
| query | `bootstrap` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `18356403e533f2386f458c8e8b0d3d507736ef87642f7c2169a3cc820e034613`; event ID: `ccc59771-9124-4236-95f9-74d07df2cf4e`.
- Thời điểm: **30/10/2026 02:29:09.050 ICT**; mức `request_error`; retry đã ghi: `0`.
- Source: [https://www.facebook.com/groups/1474306576184076](https://www.facebook.com/groups/1474306576184076).
- Post: [https://www.facebook.com/1474306576184076_4610129829268386](https://www.facebook.com/1474306576184076_4610129829268386).
- Request route: `https://www.facebook.com/1474306576184076_4610129829268386`.
- elapsedMs=20839; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `bf465100ec7fc0556b182ff0c9d3a95a488a290c56a2546f2ae66ce11182238c` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_connect / error | None / None | false | — | — | 20839 | 0 / None | — | — |

### Case 2

- Job ID: `99d8c2f4c18617705a33700db2720205469468baa0ef2d38752081a434d2bcbd`; event ID: `53053f7a-8edc-4175-ab7c-89e6542b64a1`.
- Thời điểm: **30/10/2026 03:07:27.388 ICT**; mức `request_error`; retry đã ghi: `0`.
- Source: [https://www.facebook.com/groups/1705256516204292](https://www.facebook.com/groups/1705256516204292).
- Post: [https://www.facebook.com/1705256516204292_29963901993246366](https://www.facebook.com/1705256516204292_29963901993246366).
- Request route: `https://www.facebook.com/1705256516204292_29963901993246366`.
- elapsedMs=20949; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `affaf876df2d020091c10b062f561aae049fbed6c8785dde7a22374eab9bcdf7` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_connect / error | None / None | false | — | — | 20949 | 0 / None | — | — |

## G028 — youtube-comment / UPSTREAM_NETWORK_ERROR

`UPSTREAM_NETWORK_ERROR__PROXY_CONNECT__COMMENTS`

Group key: `ca5e5b9579c6901daf134a6df31117d8086b6a898a6d321a37083d0d46f6c1a1`. Lần đầu 30/10/2026 02:14:47.612; lần cuối 30/10/2026 03:59:55.486.

**Số ghi nhận riêng từng mức:** RQ=369; RT=369; RF=0; JF=0. Tổng bản ghi quan sát=738.

**Quan sát:** Thất bại trước khi ghi nhận CONNECT hoàn tất/socket origin. Không có nativeCode và chưa có HTTP status ở các case mẫu.

**Chưa biết/giới hạn:** Chưa phân biệt được DNS tới proxy, TCP tới proxy, đóng sớm hay timeout tunnel. Tuyệt đối không đổi nhóm này thành ECONNRESET.

**Hướng xử lý:** Bổ sung cause.code/errno/syscall và timing DNS/TCP/CONNECT của agent; kiểm tra proxy-manager/provider log theo endpoint hash và giờ case.

| Thuộc tính | Giá trị |
|---|---|
| platform | `youtube` |
| phase | `proxy_connect` |
| originalReason | `UPSTREAM_NETWORK_ERROR` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `comments` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `d6e509dc58937e3af74c26e319bab6dd43f2d317f4ff7abcad0c6bc725bf7509`; event ID: `8387ef74-bd15-41e8-8126-6a5f74fbe490`.
- Thời điểm: **30/10/2026 03:00:29.178 ICT**; mức `request_error`; retry đã ghi: `3`.
- Source: [https://www.youtube.com/channel/UCOEvEldWBMOHNdlzcofFa9w](https://www.youtube.com/channel/UCOEvEldWBMOHNdlzcofFa9w).
- Post: [https://www.youtube.com/watch?v=JyM8kNNyQec](https://www.youtube.com/watch?v=JyM8kNNyQec).
- Request route: `https://www.youtube.com/watch`.
- elapsedMs=20835; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `affaf876df2d020091c10b062f561aae049fbed6c8785dde7a22374eab9bcdf7` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_connect / error | None / None | false | — | — | 20835 | 0 / None | — | — |

### Case 2

- Job ID: `e641680dacbb89be1ac798810f50134406eae0826ba1ef0c66d2444954b5374d`; event ID: `ed6516fa-3e93-48c8-b850-669892107ce8`.
- Thời điểm: **30/10/2026 03:23:16.374 ICT**; mức `request_error`; retry đã ghi: `0`.
- Source: [https://www.youtube.com/channel/UClYUCB6tyZl50_7OcbgUHCA](https://www.youtube.com/channel/UClYUCB6tyZl50_7OcbgUHCA).
- Post: [https://www.youtube.com/watch?v=ODKAP7ylMho](https://www.youtube.com/watch?v=ODKAP7ylMho).
- Request route: `https://www.youtube.com/watch`.
- elapsedMs=20879; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `01a01fd0e59c6a8b21005bfea6b6b918dde95729dadb2b3e9f73a7202e51cbc2` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_connect / error | None / None | false | — | — | 20879 | 0 / None | — | — |

## G029 — facebook-reply / NETWORK_ERROR

`NETWORK_ERROR__PROXY_CONNECT__BOOTSTRAP__BOOTSTRAP`

Group key: `e9413a5c2e20e883d5f1f635e2a423e1a198cfd1b3577d6f2d8fbcb3b8f36b37`. Lần đầu 30/10/2026 00:56:46.746; lần cuối 30/10/2026 04:00:12.112.

**Số ghi nhận riêng từng mức:** RQ=0; RT=675; RF=0; JF=0. Tổng bản ghi quan sát=675.

**Quan sát:** Thất bại trước khi ghi nhận CONNECT hoàn tất/socket origin. Không có nativeCode và chưa có HTTP status ở các case mẫu.

**Chưa biết/giới hạn:** Chưa phân biệt được DNS tới proxy, TCP tới proxy, đóng sớm hay timeout tunnel. Tuyệt đối không đổi nhóm này thành ECONNRESET.

**Hướng xử lý:** Bổ sung cause.code/errno/syscall và timing DNS/TCP/CONNECT của agent; kiểm tra proxy-manager/provider log theo endpoint hash và giờ case.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `proxy_connect` |
| originalReason | `NETWORK_ERROR` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `bootstrap` |
| query | `bootstrap` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `b59b0c07f8ba6c7adb3dc6eb928424bd86086a43368459f16ffd311bd1e865e2`; event ID: `9da705dc-e163-4aad-8c8e-e858cfbe5ed8`.
- Thời điểm: **30/10/2026 02:39:21.914 ICT**; mức `read_retry`; retry đã ghi: `3`.
- Source: [https://www.facebook.com/groups/1106605613276683](https://www.facebook.com/groups/1106605613276683).
- Post: [https://www.facebook.com/1106605613276683_2191921248078442](https://www.facebook.com/1106605613276683_2191921248078442).
- Request route: `https://www.facebook.com/1106605613276683_2191921248078442`.
- elapsedMs=21002; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `bf465100ec7fc0556b182ff0c9d3a95a488a290c56a2546f2ae66ce11182238c` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_connect / error | None / None | false | — | — | 21002 | 0 / None | — | — |

### Case 2

- Job ID: `0bab97b51ce03ed25854f4fec74747fc7eb1ed9d4b28c47ce0bd8258d50a99ed`; event ID: `7b21236e-bfb4-420a-80ce-8d6cb6f4502a`.
- Thời điểm: **30/10/2026 03:40:24.087 ICT**; mức `read_retry`; retry đã ghi: `1`.
- Source: [https://www.facebook.com/groups/1439792593020777](https://www.facebook.com/groups/1439792593020777).
- Post: [https://www.facebook.com/1439792593020777_2990921747907846](https://www.facebook.com/1439792593020777_2990921747907846).
- Request route: `https://www.facebook.com/1439792593020777_2990921747907846`.
- elapsedMs=21216; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `01a01fd0e59c6a8b21005bfea6b6b918dde95729dadb2b3e9f73a7202e51cbc2` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_connect / error | None / None | false | — | — | 21216 | 0 / None | — | — |

## G030 — facebook-reply / UPSTREAM_NETWORK_ERROR

`UPSTREAM_NETWORK_ERROR__PROXY_CONNECT__BOOTSTRAP__BOOTSTRAP`

Group key: `e07860716b6eb94fa254e12cd6a83767e2a6e8d4ba38e1f3226843695beb108a`. Lần đầu 30/10/2026 00:56:46.668; lần cuối 30/10/2026 04:00:11.968.

**Số ghi nhận riêng từng mức:** RQ=675; RT=0; RF=0; JF=0. Tổng bản ghi quan sát=675.

**Quan sát:** Thất bại trước khi ghi nhận CONNECT hoàn tất/socket origin. Không có nativeCode và chưa có HTTP status ở các case mẫu.

**Chưa biết/giới hạn:** Chưa phân biệt được DNS tới proxy, TCP tới proxy, đóng sớm hay timeout tunnel. Tuyệt đối không đổi nhóm này thành ECONNRESET.

**Hướng xử lý:** Bổ sung cause.code/errno/syscall và timing DNS/TCP/CONNECT của agent; kiểm tra proxy-manager/provider log theo endpoint hash và giờ case.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `proxy_connect` |
| originalReason | `UPSTREAM_NETWORK_ERROR` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `bootstrap` |
| query | `bootstrap` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `ccd5b85982e09cae9d60600832d009acce28aa628c2e3f9e5a51c741645c7a84`; event ID: `a4542d77-e66a-4963-b157-039ec7ccc8dc`.
- Thời điểm: **30/10/2026 02:31:18.960 ICT**; mức `request_error`; retry đã ghi: `1`.
- Source: [https://www.facebook.com/groups/1062841121901246](https://www.facebook.com/groups/1062841121901246).
- Post: [https://www.facebook.com/1062841121901246_1687161852802500](https://www.facebook.com/1062841121901246_1687161852802500).
- Request route: `https://www.facebook.com/1062841121901246_1687161852802500`.
- elapsedMs=21112; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `840bd17f4157c8e00bb17a0c9abf91aa3a9ca5c8a821253b1fae93d37bf51400` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_connect / error | None / None | false | — | — | 21112 | 0 / None | — | — |

### Case 2

- Job ID: `2b3d5add0d8770678962f45d931a2da1195fc6dc8d4a4889fe573f7bf3a65986`; event ID: `5a9b9306-b0e0-47a3-b161-28f81057cee1`.
- Thời điểm: **30/10/2026 02:38:44.156 ICT**; mức `request_error`; retry đã ghi: `1`.
- Source: [https://www.facebook.com/groups/1106605613276683](https://www.facebook.com/groups/1106605613276683).
- Post: [https://www.facebook.com/1106605613276683_2192026788067888](https://www.facebook.com/1106605613276683_2192026788067888).
- Request route: `https://www.facebook.com/1106605613276683_2192026788067888`.
- elapsedMs=20724; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `bf465100ec7fc0556b182ff0c9d3a95a488a290c56a2546f2ae66ce11182238c` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_connect / error | None / None | false | — | — | 20724 | 0 / None | — | — |

## G031 — facebook-comment / COMMENTS_UNAVAILABLE

`COMMENTS_UNAVAILABLE__HTTP_RESPONSE__HTTP_200__BR__COMMENTS__COMMENTLISTCOMPONENTSROOTQUERY`

Group key: `f579b8d0bc26eee9489d60c736db69af323fd5df5e483bf8dc9ed6a377d5e208`. Lần đầu 30/10/2026 00:47:10.060; lần cuối 30/10/2026 04:00:04.846.

**Số ghi nhận riêng từng mức:** RQ=0; RT=0; RF=567; JF=0. Tổng bản ghi quan sát=567.

**Quan sát:** Native Facebook response không cung cấp comments/replies dùng được ở query CommentListComponentsRootQuery trong HTTP 200; policy hiện tại kết thúc job.

**Chưa biết/giới hạn:** Không chứng minh comment count bằng 0, bài đã xóa hoặc source private. Chưa có raw error envelope để chốt lý do không khả dụng.

**Hướng xử lý:** Mở case tương ứng và kiểm tra native connection/error envelope, quyền anonymous và query root/reply. Giữ dữ liệu hợp lệ đã đọc; không đổi unavailable thành empty-success.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `http_response` |
| originalReason | `COMMENTS_UNAVAILABLE` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `200` |
| apiCode | `—` |
| operation | `comments` |
| query | `CommentListComponentsRootQuery` |
| stage | `—` |
| bodyEncoding | `br` |
| wireComplete | `true` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `33fb5246b4932ab544683b7c757a468d1a5366374061889406954a536d387cab`; event ID: `491d53e0-0ad8-49c3-b3be-591012d8fedc`.
- Thời điểm: **30/10/2026 01:00:09.234 ICT**; mức `read_failure`; retry đã ghi: `1`.
- Source: [https://www.facebook.com/groups/1023069638660550](https://www.facebook.com/groups/1023069638660550).
- Post: [https://www.facebook.com/1023069638660550_1657048295262678](https://www.facebook.com/1023069638660550_1657048295262678).
- Request route: `—`.
- elapsedMs=1103; wireBytes=110; decodedBytes=144; wireComplete=true.
- Proxy endpoint hash: `840bd17f4157c8e00bb17a0c9abf91aa3a9ca5c8a821253b1fae93d37bf51400` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 200 / 200 | false | 1788 | 2694 | 11162 | 68977 / 311470 | true | — |
| 2 | complete / complete | 200 / None | true | 1 | 773 | 1103 | 110 / 144 | true | — |

### Case 2

- Job ID: `918d870d885f9220a834e577dc58abf78f3a51c54b9fc488b1adbf99e9e0b44d`; event ID: `d3da41c7-40f4-494d-a750-e2753dc5941d`.
- Thời điểm: **30/10/2026 03:56:05.646 ICT**; mức `read_failure`; retry đã ghi: `0`.
- Source: [https://www.facebook.com/groups/213240973487](https://www.facebook.com/groups/213240973487).
- Post: [https://www.facebook.com/213240973487_10166569958978488](https://www.facebook.com/213240973487_10166569958978488).
- Request route: `—`.
- elapsedMs=787; wireBytes=110; decodedBytes=144; wireComplete=true.
- Proxy endpoint hash: `400d942014123b1801d773e3cb173288d6406033dd334344d3e6fc0268dcc3e7` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 200 / 200 | false | 1669 | 2351 | 9273 | 68611 / 310800 | true | — |
| 2 | complete / complete | 200 / None | true | 1 | 635 | 787 | 110 / 144 | true | — |

## G032 — facebook-group-source / UPSTREAM_NETWORK_ERROR

`UPSTREAM_NETWORK_ERROR__PROXY_CONNECT__BOOTSTRAP__BOOTSTRAP`

Group key: `8803ff784e5b190db60762f27ec3c5b82299fafb39758b8c5d69dbc40ab595a3`. Lần đầu 30/10/2026 02:14:44.526; lần cuối 30/10/2026 04:00:17.640.

**Số ghi nhận riêng từng mức:** RQ=547; RT=0; RF=0; JF=0. Tổng bản ghi quan sát=547.

**Quan sát:** Thất bại trước khi ghi nhận CONNECT hoàn tất/socket origin. Không có nativeCode và chưa có HTTP status ở các case mẫu.

**Chưa biết/giới hạn:** Chưa phân biệt được DNS tới proxy, TCP tới proxy, đóng sớm hay timeout tunnel. Tuyệt đối không đổi nhóm này thành ECONNRESET.

**Hướng xử lý:** Bổ sung cause.code/errno/syscall và timing DNS/TCP/CONNECT của agent; kiểm tra proxy-manager/provider log theo endpoint hash và giờ case.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `proxy_connect` |
| originalReason | `UPSTREAM_NETWORK_ERROR` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `bootstrap` |
| query | `bootstrap` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `4329425dcfea09ba4e46026ee7f59a5a597cd8cb6a8df9ecfb9042241382ab11`; event ID: `3339b4b7-89fe-4778-852e-72f08e2f80f2`.
- Thời điểm: **30/10/2026 02:14:44.526 ICT**; mức `request_error`; retry đã ghi: `2`.
- Source: [https://www.facebook.com/groups/2982069938724369](https://www.facebook.com/groups/2982069938724369).
- Request route: `https://www.facebook.com/groups/2982069938724369/`.
- elapsedMs=20926; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `bf465100ec7fc0556b182ff0c9d3a95a488a290c56a2546f2ae66ce11182238c` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_connect / error | None / None | false | — | — | 20926 | 0 / None | — | — |

### Case 2

- Job ID: `1bfa20bad9a69493d869fb7edf2e27950ff81ffa612171cec083eb93842efd0d`; event ID: `b556eeb2-017f-4dfc-9480-13a42221d5ee`.
- Thời điểm: **30/10/2026 03:56:20.296 ICT**; mức `request_error`; retry đã ghi: `3`.
- Source: [https://www.facebook.com/groups/541415883711059](https://www.facebook.com/groups/541415883711059).
- Request route: `https://www.facebook.com/groups/541415883711059/`.
- elapsedMs=20782; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `04008c14c6432cfd675d31322da8f6f3a9968c5f7b630ce1212c5f7335a8e408` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_connect / error | None / None | false | — | — | 20782 | 0 / None | — | — |

## G033 — facebook-group-source / NETWORK_ERROR

`NETWORK_ERROR__PROXY_CONNECT__BOOTSTRAP__BOOTSTRAP`

Group key: `34438293bdc4352dbaed9c9268e3ab8d9925749c00948aa48c5a701b103288c9`. Lần đầu 30/10/2026 02:14:44.640; lần cuối 30/10/2026 04:00:17.801.

**Số ghi nhận riêng từng mức:** RQ=0; RT=547; RF=0; JF=0. Tổng bản ghi quan sát=547.

**Quan sát:** Thất bại trước khi ghi nhận CONNECT hoàn tất/socket origin. Không có nativeCode và chưa có HTTP status ở các case mẫu.

**Chưa biết/giới hạn:** Chưa phân biệt được DNS tới proxy, TCP tới proxy, đóng sớm hay timeout tunnel. Tuyệt đối không đổi nhóm này thành ECONNRESET.

**Hướng xử lý:** Bổ sung cause.code/errno/syscall và timing DNS/TCP/CONNECT của agent; kiểm tra proxy-manager/provider log theo endpoint hash và giờ case.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `proxy_connect` |
| originalReason | `NETWORK_ERROR` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `bootstrap` |
| query | `bootstrap` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `9305debb50cbc4f5cea0496f728d3fa97a6bb663ed2bcc9bfef6104f2f741e87`; event ID: `d7af5784-23fe-4ac3-b7de-d6cbb10b2f18`.
- Thời điểm: **30/10/2026 03:09:39.731 ICT**; mức `read_retry`; retry đã ghi: `2`.
- Source: [https://www.facebook.com/groups/441256137824938](https://www.facebook.com/groups/441256137824938).
- Request route: `https://www.facebook.com/groups/441256137824938/`.
- elapsedMs=21067; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `affaf876df2d020091c10b062f561aae049fbed6c8785dde7a22374eab9bcdf7` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_connect / error | None / None | false | — | — | 21067 | 0 / None | — | — |

### Case 2

- Job ID: `bf875251e4025ac768ddbbb4bda6327b93d6dfa49950e1f94b557155336c2c95`; event ID: `a3229022-0993-4ce1-ad1d-a2b1e25f515d`.
- Thời điểm: **30/10/2026 03:16:59.503 ICT**; mức `read_retry`; retry đã ghi: `3`.
- Source: [https://www.facebook.com/groups/461661603071664](https://www.facebook.com/groups/461661603071664).
- Request route: `https://www.facebook.com/groups/461661603071664/`.
- elapsedMs=20786; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `494b6bd8a59601c5d60882de51c875b491ad5b7af827c0a51a2a59c2dfad3460` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_connect / error | None / None | false | — | — | 20786 | 0 / None | — | — |

## G034 — facebook-user-source / AUTH_REQUIRED

`AUTH_REQUIRED__HTTP_RESPONSE__HTTP_200__BR__BOOTSTRAP__BOOTSTRAP`

Group key: `c6e810c2500144a5ebc191b0e6079e0b05b73c2c896bba1221851ac8d6dd435e`. Lần đầu 30/10/2026 00:47:00.080; lần cuối 30/10/2026 03:59:55.485.

**Số ghi nhận riêng từng mức:** RQ=0; RT=386; RF=51; JF=0. Tổng bản ghi quan sát=437.

**Quan sát:** HTTP 200 đã nhận đủ body; reader nhận diện nội dung yêu cầu đăng nhập tại bootstrap. Đây là cổng xác thực ở mức nội dung, không phải HTTP 401 hay reset socket.

**Chưa biết/giới hạn:** Toàn bộ mẫu auth trong cửa sổ có confirmed=false; một số xuất hiện sau khi đã có dữ liệu công khai. Chưa chứng minh source private, proxy bị chặn, hay template chắc chắn sai.

**Hướng xử lý:** Đối chiếu cùng source qua endpoint khác bằng phiên anonymous sạch và giữ dấu hiệu login/route đã khử bí mật. Tách trường hợp ban đầu với sau dữ liệu công khai; không gắn nhãn private chỉ từ login page.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `http_response` |
| originalReason | `AUTH_REQUIRED` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `200` |
| apiCode | `—` |
| operation | `bootstrap` |
| query | `bootstrap` |
| stage | `—` |
| bodyEncoding | `br` |
| wireComplete | `true` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `748fafb9069ddf5f459f03d0b6893c79432bff81284793a7294d551971d5e84e`; event ID: `0830edf7-8071-4cc1-8b8a-9a8861474897`.
- Thời điểm: **30/10/2026 01:20:50.036 ICT**; mức `read_retry`; retry đã ghi: `1`.
- Source: [https://www.facebook.com/100006256383532](https://www.facebook.com/100006256383532).
- Request route: `—`.
- elapsedMs=8576; wireBytes=76352; decodedBytes=366027; wireComplete=true.
- Proxy endpoint hash: `04008c14c6432cfd675d31322da8f6f3a9968c5f7b630ce1212c5f7335a8e408` (không phải địa chỉ/credential proxy).
- Auth evidence: `{"classification": "unverified", "confirmed": false, "stage": "initial", "evidence": "anonymous_login_or_checkpoint"}`.

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 302 / 200 | false | 2144 | 3019 | 12675 | 0 / None | true | — |
| 2 | complete / complete | 200 / None | true | 0 | 1104 | 8576 | 76352 / 366027 | true | — |

### Case 2

- Job ID: `db00c0a2ef5f3e17ad8af7ca06a0d80f342e6942f1d9cc91b27a26dd43b922d8`; event ID: `2277990b-fe1b-44c8-82d6-40e7ce0558ef`.
- Thời điểm: **30/10/2026 02:43:45.055 ICT**; mức `read_retry`; retry đã ghi: `1`.
- Source: [https://www.facebook.com/100001859116731](https://www.facebook.com/100001859116731).
- Request route: `—`.
- elapsedMs=11428; wireBytes=75723; decodedBytes=364687; wireComplete=true.
- Proxy endpoint hash: `95596101280f3fe35027a8c45359a828b7ef8262f3814efbf3d4224be8e7ecb4` (không phải địa chỉ/credential proxy).
- Auth evidence: `{"classification": "unverified", "confirmed": false, "stage": "initial", "evidence": "anonymous_login_or_checkpoint"}`.

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 302 / 200 | false | 2706 | 3321 | 15327 | 0 / None | true | — |
| 2 | complete / complete | 200 / None | true | 1 | 695 | 11428 | 75723 / 364687 | true | — |

## G035 — facebook-page-source / NETWORK_ERROR

`NETWORK_ERROR__PROXY_CONNECT__BOOTSTRAP__BOOTSTRAP`

Group key: `717bb70b58e387c29e63f8df4c2d8f5d5b387a74c41c7944f2dfe4861c27631a`. Lần đầu 30/10/2026 02:14:44.638; lần cuối 30/10/2026 04:00:04.816.

**Số ghi nhận riêng từng mức:** RQ=0; RT=344; RF=0; JF=0. Tổng bản ghi quan sát=344.

**Quan sát:** Thất bại trước khi ghi nhận CONNECT hoàn tất/socket origin. Không có nativeCode và chưa có HTTP status ở các case mẫu.

**Chưa biết/giới hạn:** Chưa phân biệt được DNS tới proxy, TCP tới proxy, đóng sớm hay timeout tunnel. Tuyệt đối không đổi nhóm này thành ECONNRESET.

**Hướng xử lý:** Bổ sung cause.code/errno/syscall và timing DNS/TCP/CONNECT của agent; kiểm tra proxy-manager/provider log theo endpoint hash và giờ case.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `proxy_connect` |
| originalReason | `NETWORK_ERROR` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `bootstrap` |
| query | `bootstrap` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `6e9fed31f691acaf90ae9f15da9e1c8845f4a58260ddd8d1426d421ce8deb530`; event ID: `b2116d47-0b41-47aa-ab84-8604c10ba299`.
- Thời điểm: **30/10/2026 02:18:17.388 ICT**; mức `read_retry`; retry đã ghi: `2`.
- Source: [https://www.facebook.com/101638435114627](https://www.facebook.com/101638435114627).
- Request route: `https://www.facebook.com/100063484964701`.
- elapsedMs=20795; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `bf465100ec7fc0556b182ff0c9d3a95a488a290c56a2546f2ae66ce11182238c` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_connect / error | None / None | false | — | — | 20795 | 0 / None | — | — |

### Case 2

- Job ID: `e2325a4a321f2b0d385516780cb6b6fa4abea41c88f7e2f7b194edf55ef73554`; event ID: `b015fcf2-bb35-480f-9874-5f5eab99bd4c`.
- Thời điểm: **30/10/2026 03:00:25.235 ICT**; mức `read_retry`; retry đã ghi: `4`.
- Source: [https://www.facebook.com/1124921834027126](https://www.facebook.com/1124921834027126).
- Request route: `https://www.facebook.com/61579578076892`.
- elapsedMs=20831; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `affaf876df2d020091c10b062f561aae049fbed6c8785dde7a22374eab9bcdf7` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_connect / error | None / None | false | — | — | 20831 | 0 / None | — | — |

## G036 — facebook-page-source / UPSTREAM_NETWORK_ERROR

`UPSTREAM_NETWORK_ERROR__PROXY_CONNECT__BOOTSTRAP__BOOTSTRAP`

Group key: `f71b5c7a7573fdde2c6e581673f18ea110951a24122486fef1befe55ad150af5`. Lần đầu 30/10/2026 02:14:44.528; lần cuối 30/10/2026 04:00:04.663.

**Số ghi nhận riêng từng mức:** RQ=344; RT=0; RF=0; JF=0. Tổng bản ghi quan sát=344.

**Quan sát:** Thất bại trước khi ghi nhận CONNECT hoàn tất/socket origin. Không có nativeCode và chưa có HTTP status ở các case mẫu.

**Chưa biết/giới hạn:** Chưa phân biệt được DNS tới proxy, TCP tới proxy, đóng sớm hay timeout tunnel. Tuyệt đối không đổi nhóm này thành ECONNRESET.

**Hướng xử lý:** Bổ sung cause.code/errno/syscall và timing DNS/TCP/CONNECT của agent; kiểm tra proxy-manager/provider log theo endpoint hash và giờ case.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `proxy_connect` |
| originalReason | `UPSTREAM_NETWORK_ERROR` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `bootstrap` |
| query | `bootstrap` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `b894cdecb9f2ec7c8ddbf2785a38c5afa1bb073282584d65c30ebdbd91aa7373`; event ID: `c669483b-71f9-4320-a24c-7abd620ac060`.
- Thời điểm: **30/10/2026 02:37:07.634 ICT**; mức `request_error`; retry đã ghi: `1`.
- Source: [https://www.facebook.com/105757318555604](https://www.facebook.com/105757318555604).
- Request route: `https://www.facebook.com/100076034092299`.
- elapsedMs=20675; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `840bd17f4157c8e00bb17a0c9abf91aa3a9ca5c8a821253b1fae93d37bf51400` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_connect / error | None / None | false | — | — | 20675 | 0 / None | — | — |

### Case 2

- Job ID: `8f4684b3532e3eed7733c98afae9f4a65df84b7a2cc26ed03cfa5da57ecc51bc`; event ID: `c188bfd0-adb7-4971-bec1-f47449df5e2f`.
- Thời điểm: **30/10/2026 03:43:13.418 ICT**; mức `request_error`; retry đã ghi: `2`.
- Source: [https://www.facebook.com/206684333179692](https://www.facebook.com/206684333179692).
- Request route: `https://www.facebook.com/100064414733518`.
- elapsedMs=20952; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `01a01fd0e59c6a8b21005bfea6b6b918dde95729dadb2b3e9f73a7202e51cbc2` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_connect / error | None / None | false | — | — | 20952 | 0 / None | — | — |

## G037 — threads-source / UPSTREAM_NETWORK_ERROR

`UPSTREAM_NETWORK_ERROR__PROXY_CONNECT__SOURCE`

Group key: `e65584560df06df32dcf523b1b2ab412549880b21ffd6443cc2e60814207a2e1`. Lần đầu 30/10/2026 02:15:10.303; lần cuối 30/10/2026 03:59:08.740.

**Số ghi nhận riêng từng mức:** RQ=136; RT=136; RF=0; JF=0. Tổng bản ghi quan sát=272.

**Quan sát:** Thất bại trước khi ghi nhận CONNECT hoàn tất/socket origin. Không có nativeCode và chưa có HTTP status ở các case mẫu.

**Chưa biết/giới hạn:** Chưa phân biệt được DNS tới proxy, TCP tới proxy, đóng sớm hay timeout tunnel. Tuyệt đối không đổi nhóm này thành ECONNRESET.

**Hướng xử lý:** Bổ sung cause.code/errno/syscall và timing DNS/TCP/CONNECT của agent; kiểm tra proxy-manager/provider log theo endpoint hash và giờ case.

| Thuộc tính | Giá trị |
|---|---|
| platform | `threads` |
| phase | `proxy_connect` |
| originalReason | `UPSTREAM_NETWORK_ERROR` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `5aa899add6090591cba18e36d1d5aa6c0cedb42b8f1af39d91955358da3126c7`; event ID: `cca2b7a9-290a-43a8-bc5a-51197365b146`.
- Thời điểm: **30/10/2026 02:15:49.522 ICT**; mức `request_error`; retry đã ghi: `2`.
- Source: [https://www.threads.com/@pocdatcat_/](https://www.threads.com/@pocdatcat_/).
- Request route: `https://www.threads.com/@pocdatcat_`.
- elapsedMs=20627; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `bf465100ec7fc0556b182ff0c9d3a95a488a290c56a2546f2ae66ce11182238c` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_connect / error | None / None | false | — | — | 20627 | 0 / None | — | — |

### Case 2

- Job ID: `ff5c2bb5fa0d512c7ef51f6c99f1af5beba8a2fac5c0b2dec91455e1df2e7d14`; event ID: `a08e9efd-1ece-4782-9caf-6a6e08c1fefd`.
- Thời điểm: **30/10/2026 02:16:24.166 ICT**; mức `request_error`; retry đã ghi: `0`.
- Source: [https://www.threads.com/@chomchom04__](https://www.threads.com/@chomchom04__).
- Request route: `https://www.threads.com/@chomchom04__`.
- elapsedMs=21262; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `bf465100ec7fc0556b182ff0c9d3a95a488a290c56a2546f2ae66ce11182238c` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_connect / error | None / None | false | — | — | 21262 | 0 / None | — | — |

## G038 — threads-comment / UPSTREAM_NETWORK_ERROR

`UPSTREAM_NETWORK_ERROR__PROXY_CONNECT__COMMENTS`

Group key: `b3321cfc078d221e67066f481e3959a6ec6cb70c7f51c71eb54b879c6c3b0585`. Lần đầu 30/10/2026 02:15:10.219; lần cuối 30/10/2026 03:59:58.082.

**Số ghi nhận riêng từng mức:** RQ=130; RT=130; RF=0; JF=0. Tổng bản ghi quan sát=260.

**Quan sát:** Thất bại trước khi ghi nhận CONNECT hoàn tất/socket origin. Không có nativeCode và chưa có HTTP status ở các case mẫu.

**Chưa biết/giới hạn:** Chưa phân biệt được DNS tới proxy, TCP tới proxy, đóng sớm hay timeout tunnel. Tuyệt đối không đổi nhóm này thành ECONNRESET.

**Hướng xử lý:** Bổ sung cause.code/errno/syscall và timing DNS/TCP/CONNECT của agent; kiểm tra proxy-manager/provider log theo endpoint hash và giờ case.

| Thuộc tính | Giá trị |
|---|---|
| platform | `threads` |
| phase | `proxy_connect` |
| originalReason | `UPSTREAM_NETWORK_ERROR` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `comments` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `6d948567d382a9fa53fc43a6bf6201ace2454e6c42166921bdf61fe2a3a124ca`; event ID: `88421e6f-4a79-44c3-906e-7f69fbeb79a0`.
- Thời điểm: **30/10/2026 02:18:29.916 ICT**; mức `request_error`; retry đã ghi: `2`.
- Source: [https://www.threads.com/@fc.vuongbinh](https://www.threads.com/@fc.vuongbinh).
- Post: [https://www.threads.com/@fc.vuongbinh/post/DfBmpMfkt-V](https://www.threads.com/@fc.vuongbinh/post/DfBmpMfkt-V).
- Request route: `https://www.threads.com/@fc.vuongbinh/post/DfBmpMfkt-V`.
- elapsedMs=20820; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `bf465100ec7fc0556b182ff0c9d3a95a488a290c56a2546f2ae66ce11182238c` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_connect / error | None / None | false | — | — | 20820 | 0 / None | — | — |

### Case 2

- Job ID: `ebd89fa5c52e747ba3f1ab921bea2eaddc40b16d2548778ef3adb64ecb1058a8`; event ID: `71de3c44-a6c5-4b3e-9e70-62d9541302ff`.
- Thời điểm: **30/10/2026 02:28:38.516 ICT**; mức `request_error`; retry đã ghi: `0`.
- Source: [https://www.threads.com/@k.diyy08](https://www.threads.com/@k.diyy08).
- Post: [https://www.threads.com/@k.diyy08/post/DfCppUyEmTl](https://www.threads.com/@k.diyy08/post/DfCppUyEmTl).
- Request route: `https://www.threads.com/@k.diyy08/post/DfCppUyEmTl`.
- elapsedMs=20915; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `840bd17f4157c8e00bb17a0c9abf91aa3a9ca5c8a821253b1fae93d37bf51400` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_connect / error | None / None | false | — | — | 20915 | 0 / None | — | — |

## G039 — youtube-source / UPSTREAM_NETWORK_ERROR

`UPSTREAM_NETWORK_ERROR__PROXY_CONNECT__SOURCE`

Group key: `4fe21d6fcac96ec4d007f6056af06c2f647cf41be114953bef847e29b6fd25e5`. Lần đầu 30/10/2026 02:15:50.621; lần cuối 30/10/2026 03:59:45.291.

**Số ghi nhận riêng từng mức:** RQ=126; RT=126; RF=0; JF=0. Tổng bản ghi quan sát=252.

**Quan sát:** Thất bại trước khi ghi nhận CONNECT hoàn tất/socket origin. Không có nativeCode và chưa có HTTP status ở các case mẫu.

**Chưa biết/giới hạn:** Chưa phân biệt được DNS tới proxy, TCP tới proxy, đóng sớm hay timeout tunnel. Tuyệt đối không đổi nhóm này thành ECONNRESET.

**Hướng xử lý:** Bổ sung cause.code/errno/syscall và timing DNS/TCP/CONNECT của agent; kiểm tra proxy-manager/provider log theo endpoint hash và giờ case.

| Thuộc tính | Giá trị |
|---|---|
| platform | `youtube` |
| phase | `proxy_connect` |
| originalReason | `UPSTREAM_NETWORK_ERROR` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `08380be4fef538300126b3237622b33dbe293ed50ad04b00aad3bba1b792a048`; event ID: `1f81bf2c-ab59-435d-bd3f-522a15153f46`.
- Thời điểm: **30/10/2026 03:08:54.598 ICT**; mức `request_error`; retry đã ghi: `5`.
- Source: [https://www.youtube.com/channel/UCRXzlzDy2wWglPlEIFfO5rA](https://www.youtube.com/channel/UCRXzlzDy2wWglPlEIFfO5rA).
- Request route: `https://www.youtube.com/channel/UCRXzlzDy2wWglPlEIFfO5rA/videos`.
- elapsedMs=20648; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `494b6bd8a59601c5d60882de51c875b491ad5b7af827c0a51a2a59c2dfad3460` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_connect / error | None / None | false | — | — | 20648 | 0 / None | — | — |

### Case 2

- Job ID: `bf7a062d656ec535d53ec4c720431dbfb0d3dec1bf4997d7b58968ed9ef95760`; event ID: `4c6b4db4-e452-4e24-a22c-1136be9ba584`.
- Thời điểm: **30/10/2026 03:57:41.625 ICT**; mức `request_error`; retry đã ghi: `6`.
- Source: [https://www.youtube.com/channel/UCUsX8KCaP-HazuwUS0GvSmQ](https://www.youtube.com/channel/UCUsX8KCaP-HazuwUS0GvSmQ).
- Request route: `https://www.youtube.com/channel/UCUsX8KCaP-HazuwUS0GvSmQ/videos`.
- elapsedMs=20795; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `04008c14c6432cfd675d31322da8f6f3a9968c5f7b630ce1212c5f7335a8e408` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_connect / error | None / None | false | — | — | 20795 | 0 / None | — | — |

## G040 — instagram-comment / UPSTREAM_NETWORK_ERROR

`UPSTREAM_NETWORK_ERROR__PROXY_CONNECT__COMMENTS`

Group key: `b806b8204114c998965b385bca98fdd8e3cf03aa4557aca9be1df95a70eff2e7`. Lần đầu 30/10/2026 02:15:11.543; lần cuối 30/10/2026 03:59:59.923.

**Số ghi nhận riêng từng mức:** RQ=107; RT=106; RF=1; JF=0. Tổng bản ghi quan sát=214.

**Quan sát:** Thất bại trước khi ghi nhận CONNECT hoàn tất/socket origin. Không có nativeCode và chưa có HTTP status ở các case mẫu.

**Chưa biết/giới hạn:** Chưa phân biệt được DNS tới proxy, TCP tới proxy, đóng sớm hay timeout tunnel. Tuyệt đối không đổi nhóm này thành ECONNRESET.

**Hướng xử lý:** Bổ sung cause.code/errno/syscall và timing DNS/TCP/CONNECT của agent; kiểm tra proxy-manager/provider log theo endpoint hash và giờ case.

| Thuộc tính | Giá trị |
|---|---|
| platform | `instagram` |
| phase | `proxy_connect` |
| originalReason | `UPSTREAM_NETWORK_ERROR` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `comments` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `4486064c783afccb1cecb1f02cdf3e231a8cf80b515bee8691029b8346777f99`; event ID: `3704fe62-30dc-4b14-82fa-7b15c0979207`.
- Thời điểm: **30/10/2026 02:23:50.398 ICT**; mức `request_error`; retry đã ghi: `0`.
- Source: [https://www.instagram.com/misscosmointernational/](https://www.instagram.com/misscosmointernational/).
- Post: [https://www.instagram.com/p/DfElVuZGpbl/](https://www.instagram.com/p/DfElVuZGpbl/).
- Request route: `https://www.instagram.com/p/DfElVuZGpbl/`.
- elapsedMs=20627; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `840bd17f4157c8e00bb17a0c9abf91aa3a9ca5c8a821253b1fae93d37bf51400` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_connect / error | None / None | false | — | — | 20627 | 0 / None | — | — |

### Case 2

- Job ID: `42466a560854aa845d8811645f471e7ca5c1eed318a11bbf8e9f2c8c6889af10`; event ID: `fb4d3a26-ae07-4b44-b3a7-41ba15812222`.
- Thời điểm: **30/10/2026 03:05:18.617 ICT**; mức `request_error`; retry đã ghi: `8`.
- Source: [https://www.instagram.com/dpidamu/](https://www.instagram.com/dpidamu/).
- Post: [https://www.instagram.com/reel/DfB-9THySRz/](https://www.instagram.com/reel/DfB-9THySRz/).
- Request route: `https://www.instagram.com/reel/DfB-9THySRz/`.
- elapsedMs=20591; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `affaf876df2d020091c10b062f561aae049fbed6c8785dde7a22374eab9bcdf7` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_connect / error | None / None | false | — | — | 20591 | 0 / None | — | — |

## G041 — instagram-source / UPSTREAM_NETWORK_ERROR

`UPSTREAM_NETWORK_ERROR__PROXY_CONNECT__SOURCE`

Group key: `39a06696fd215bfa3cc38fa366d3f2dfd07c0da00dfac77bd0d308692f32afdf`. Lần đầu 30/10/2026 02:15:10.241; lần cuối 30/10/2026 04:00:05.253.

**Số ghi nhận riêng từng mức:** RQ=105; RT=105; RF=0; JF=0. Tổng bản ghi quan sát=210.

**Quan sát:** Thất bại trước khi ghi nhận CONNECT hoàn tất/socket origin. Không có nativeCode và chưa có HTTP status ở các case mẫu.

**Chưa biết/giới hạn:** Chưa phân biệt được DNS tới proxy, TCP tới proxy, đóng sớm hay timeout tunnel. Tuyệt đối không đổi nhóm này thành ECONNRESET.

**Hướng xử lý:** Bổ sung cause.code/errno/syscall và timing DNS/TCP/CONNECT của agent; kiểm tra proxy-manager/provider log theo endpoint hash và giờ case.

| Thuộc tính | Giá trị |
|---|---|
| platform | `instagram` |
| phase | `proxy_connect` |
| originalReason | `UPSTREAM_NETWORK_ERROR` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `768133287b536977067aef661e3edb87d6e1f2b143dfb0d071a932c891d8c82d`; event ID: `4bb97059-2d40-4651-b736-821dddb7947d`.
- Thời điểm: **30/10/2026 02:16:49.481 ICT**; mức `request_error`; retry đã ghi: `0`.
- Source: [https://www.instagram.com/kenby357/](https://www.instagram.com/kenby357/).
- Request route: `https://www.instagram.com/kenby357/`.
- elapsedMs=20680; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `bf465100ec7fc0556b182ff0c9d3a95a488a290c56a2546f2ae66ce11182238c` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_connect / error | None / None | false | — | — | 20680 | 0 / None | — | — |

### Case 2

- Job ID: `86c9135e243f6bf9fddb77ac3a71122a6c7d1574c1aab1c5a6dc08768a81c9d6`; event ID: `35b46b4f-dc6a-4238-9237-a5c3fcbe802c`.
- Thời điểm: **30/10/2026 02:23:47.832 ICT**; mức `request_error`; retry đã ghi: `12`.
- Source: [https://www.instagram.com/thaisashes/](https://www.instagram.com/thaisashes/).
- Request route: `https://www.instagram.com/thaisashes/`.
- elapsedMs=20895; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `840bd17f4157c8e00bb17a0c9abf91aa3a9ca5c8a821253b1fae93d37bf51400` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_connect / error | None / None | false | — | — | 20895 | 0 / None | — | — |

## G042 — threads-source / UPSTREAM_HTTP_429

`UPSTREAM_HTTP_429__HTTP_RESPONSE__HTTP_429__SOURCE`

Group key: `d22055efe54b53f0aed7030daa4be1262fb0516be1bd020fbc21471deba4f23c`. Lần đầu 30/10/2026 00:53:24.652; lần cuối 30/10/2026 03:54:41.004.

**Số ghi nhận riêng từng mức:** RQ=104; RT=104; RF=0; JF=0. Tổng bản ghi quan sát=208.

**Quan sát:** Platform request trả HTTP 429; body được chủ động bỏ đọc để nhả tài nguyên nhanh. Đây không phải proxy CONNECT 429.

**Chưa biết/giới hạn:** wireComplete=false ở các case này không chứng minh lỗi truyền body: code cố ý dừng body của 429. Chưa có bằng chứng lỗi giới hạn theo một IP cụ thể.

**Hướng xử lý:** Đối chiếu Retry-After và giới hạn theo platform/operation; xem lại việc xoay proxy lặp liên tục với policy hiện tại. Không quarantine proxy chỉ từ origin HTTP 429.

| Thuộc tính | Giá trị |
|---|---|
| platform | `threads` |
| phase | `http_response` |
| originalReason | `UPSTREAM_HTTP_429` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `429` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `false` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `cc6a77cee74aa03f30219f293aaf86f9d87af7503ec1ac8ed40d2a8d24a5e63a`; event ID: `e328bde3-60fd-4ac1-9d39-86493140d04e`.
- Thời điểm: **30/10/2026 00:53:24.652 ICT**; mức `request_error`; retry đã ghi: `2`.
- Source: [https://www.threads.com/@haibahaibay/](https://www.threads.com/@haibahaibay/).
- Request route: `—`.
- elapsedMs=640; wireBytes=0; decodedBytes=—; wireComplete=false.
- Proxy endpoint hash: `affaf876df2d020091c10b062f561aae049fbed6c8785dde7a22374eab9bcdf7` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 3 | complete / complete | 429 / None | true | 0 | 640 | 640 | 0 / None | false | — |

### Case 2

- Job ID: `d9d9d368b1b74c0dfa33404c3ab4db9c31ae2c55d6c623d45a89eda44c6db4ea`; event ID: `1c55fb83-6b47-4bcc-a301-08b2ae4bf248`.
- Thời điểm: **30/10/2026 01:08:39.004 ICT**; mức `request_error`; retry đã ghi: `2`.
- Source: [https://www.threads.com/@tuilanancy](https://www.threads.com/@tuilanancy).
- Request route: `—`.
- elapsedMs=662; wireBytes=0; decodedBytes=—; wireComplete=false.
- Proxy endpoint hash: `f2bd6a7a4ebce4d3b58c87ed69f1a2df8be4cb3c1ad1e8ddf3323dc53e5f4c69` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 5 | complete / complete | 429 / None | true | 0 | 662 | 662 | 0 / None | false | — |

## G043 — instagram-comment / UPSTREAM_HTTP_429

`UPSTREAM_HTTP_429__HTTP_RESPONSE__HTTP_429__COMMENTS`

Group key: `7905551a5b53f98d4ee8519d2acf9a49a225a317fd682d642dfafa24c32b1a41`. Lần đầu 30/10/2026 00:50:43.640; lần cuối 30/10/2026 03:55:45.480.

**Số ghi nhận riêng từng mức:** RQ=99; RT=99; RF=0; JF=0. Tổng bản ghi quan sát=198.

**Quan sát:** Platform request trả HTTP 429; body được chủ động bỏ đọc để nhả tài nguyên nhanh. Đây không phải proxy CONNECT 429.

**Chưa biết/giới hạn:** wireComplete=false ở các case này không chứng minh lỗi truyền body: code cố ý dừng body của 429. Chưa có bằng chứng lỗi giới hạn theo một IP cụ thể.

**Hướng xử lý:** Đối chiếu Retry-After và giới hạn theo platform/operation; xem lại việc xoay proxy lặp liên tục với policy hiện tại. Không quarantine proxy chỉ từ origin HTTP 429.

| Thuộc tính | Giá trị |
|---|---|
| platform | `instagram` |
| phase | `http_response` |
| originalReason | `UPSTREAM_HTTP_429` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `429` |
| apiCode | `—` |
| operation | `comments` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `false` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `4efaf5252c7baec4458e5fe0fe2c8fbd6d46070d47f84f6bccd781e74c3f638e`; event ID: `d1b00e44-c6db-4c0c-983e-fddaff73e8a0`.
- Thời điểm: **30/10/2026 01:33:37.980 ICT**; mức `request_error`; retry đã ghi: `6`.
- Source: [https://www.instagram.com/missuupdates/](https://www.instagram.com/missuupdates/).
- Post: [https://www.instagram.com/p/DfDVD21gpdg/](https://www.instagram.com/p/DfDVD21gpdg/).
- Request route: `—`.
- elapsedMs=351; wireBytes=0; decodedBytes=—; wireComplete=false.
- Proxy endpoint hash: `e6f397cb2ff59e4087b3932cfac8e3a813a0df748eb91ebf76ae58e6e0c59d71` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 2 | complete / complete | 429 / None | true | 0 | 351 | 351 | 0 / None | false | — |

### Case 2

- Job ID: `764d7b43f48d5f758a76968854195823e7fb0513e4f11de46b54fe278db478e9`; event ID: `4147592d-a79b-40d8-bfd3-92ed59aad549`.
- Thời điểm: **30/10/2026 01:56:12.432 ICT**; mức `request_error`; retry đã ghi: `22`.
- Source: [https://www.instagram.com/misscosmointernational/](https://www.instagram.com/misscosmointernational/).
- Post: [https://www.instagram.com/p/DfBiSRAv8QN/](https://www.instagram.com/p/DfBiSRAv8QN/).
- Request route: `—`.
- elapsedMs=388; wireBytes=0; decodedBytes=—; wireComplete=false.
- Proxy endpoint hash: `f2bd6a7a4ebce4d3b58c87ed69f1a2df8be4cb3c1ad1e8ddf3323dc53e5f4c69` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 2 | complete / complete | 429 / None | true | 0 | 387 | 388 | 0 / None | false | — |

## G044 — facebook-group-source / FACEBOOK_RATE_LIMITED

`FACEBOOK_RATE_LIMITED__HTTP_RESPONSE__HTTP_200__BR__SOURCE`

Group key: `8128fd77f6e96c6dc64175998bb7d8e3213b605487c6aac69c3a5373e54274ef`. Lần đầu 30/10/2026 00:49:16.610; lần cuối 30/10/2026 04:00:03.390.

**Số ghi nhận riêng từng mức:** RQ=0; RT=196; RF=0; JF=0. Tổng bản ghi quan sát=196.

**Quan sát:** Reader Facebook source phân loại rate limit trong HTTP 200, nhưng native API code không được giữ ở biến thể này.

**Chưa biết/giới hạn:** Không đủ thông tin để nói nó trùng API 1675004 của comment; cần giữ riêng nhóm apiCode chưa ghi.

**Hướng xử lý:** Giữ error.code/subcode và dấu hiệu thông báo đã khử bí mật từ source adapter; đối chiếu request shape và hạn mức source.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `http_response` |
| originalReason | `FACEBOOK_RATE_LIMITED` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `200` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `br` |
| wireComplete | `true` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `4fc078b9ce030492cf9391391dd05434f9d8888cf8e594c590bd2ca879f62144`; event ID: `a9d33d46-efd8-4149-ac1e-122bfad1024c`.
- Thời điểm: **30/10/2026 02:08:26.544 ICT**; mức `read_retry`; retry đã ghi: `1`.
- Source: [https://www.facebook.com/groups/291173148148957](https://www.facebook.com/groups/291173148148957).
- Request route: `—`.
- elapsedMs=895; wireBytes=104; decodedBytes=114; wireComplete=true.
- Proxy endpoint hash: `4b519d04a4ee53d85f26400338128bca63f84f6b01481f60f65300cbe8cf3123` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 200 / 200 | false | 1307 | 1985 | 12113 | 93272 / 466452 | true | — |
| 2 | complete / complete | 200 / None | true | 1 | 570 | 895 | 104 / 114 | true | — |

### Case 2

- Job ID: `23da98efa6c7afdde4f2c003953c254036adbae21c7f257fe32f409876f8f1eb`; event ID: `23be1634-cb59-4da0-a821-432cde377903`.
- Thời điểm: **30/10/2026 03:35:47.455 ICT**; mức `read_retry`; retry đã ghi: `1`.
- Source: [https://www.facebook.com/groups/500681054698255](https://www.facebook.com/groups/500681054698255).
- Request route: `—`.
- elapsedMs=1416; wireBytes=104; decodedBytes=114; wireComplete=true.
- Proxy endpoint hash: `3c7db15748aebefc995baf35ae5ebf48c95bebc35943976e4bb089d13504314e` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 200 / 200 | false | 2126 | 2936 | 12064 | 95497 / 486158 | true | — |
| 2 | complete / complete | 200 / None | true | 1 | 605 | 1416 | 104 / 114 | true | — |

## G045 — facebook-user-source / UPSTREAM_NETWORK_ERROR

`UPSTREAM_NETWORK_ERROR__PROXY_CONNECT__BOOTSTRAP__BOOTSTRAP`

Group key: `7464bf3aee2da0374364b97ae136939ee5ec81e83af391ddc99334226ac5294f`. Lần đầu 30/10/2026 02:15:09.012; lần cuối 30/10/2026 03:59:59.902.

**Số ghi nhận riêng từng mức:** RQ=170; RT=0; RF=0; JF=0. Tổng bản ghi quan sát=170.

**Quan sát:** Thất bại trước khi ghi nhận CONNECT hoàn tất/socket origin. Không có nativeCode và chưa có HTTP status ở các case mẫu.

**Chưa biết/giới hạn:** Chưa phân biệt được DNS tới proxy, TCP tới proxy, đóng sớm hay timeout tunnel. Tuyệt đối không đổi nhóm này thành ECONNRESET.

**Hướng xử lý:** Bổ sung cause.code/errno/syscall và timing DNS/TCP/CONNECT của agent; kiểm tra proxy-manager/provider log theo endpoint hash và giờ case.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `proxy_connect` |
| originalReason | `UPSTREAM_NETWORK_ERROR` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `bootstrap` |
| query | `bootstrap` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `302bc646ffac2ef1b285b01d84933d3d08176e8cc0c5f78a20563a6e8c29f129`; event ID: `66de223c-037b-479c-b034-199ad1dc2556`.
- Thời điểm: **30/10/2026 02:53:30.249 ICT**; mức `request_error`; retry đã ghi: `2`.
- Source: [https://www.facebook.com/100002733955411](https://www.facebook.com/100002733955411).
- Request route: `https://www.facebook.com/100002733955411`.
- elapsedMs=20743; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `affaf876df2d020091c10b062f561aae049fbed6c8785dde7a22374eab9bcdf7` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_connect / error | None / None | false | — | — | 20743 | 0 / None | — | — |

### Case 2

- Job ID: `6f421dc1720dcb5f478ea4b938d8d42d0000cf693f7aacb5aeb52632db8148ca`; event ID: `cf215af5-7f1e-4d3e-a98c-da921433367d`.
- Thời điểm: **30/10/2026 02:57:28.335 ICT**; mức `request_error`; retry đã ghi: `1`.
- Source: [https://www.facebook.com/100002969804400](https://www.facebook.com/100002969804400).
- Request route: `https://www.facebook.com/100002969804400`.
- elapsedMs=20772; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `affaf876df2d020091c10b062f561aae049fbed6c8785dde7a22374eab9bcdf7` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_connect / error | None / None | false | — | — | 20772 | 0 / None | — | — |

## G046 — facebook-user-source / NETWORK_ERROR

`NETWORK_ERROR__PROXY_CONNECT__BOOTSTRAP__BOOTSTRAP`

Group key: `e391746c7bb8c8384cc0cbcf8546c7b247d141f66fb9b4ef5071c4f6926d5a53`. Lần đầu 30/10/2026 02:15:09.552; lần cuối 30/10/2026 03:59:59.922.

**Số ghi nhận riêng từng mức:** RQ=0; RT=170; RF=0; JF=0. Tổng bản ghi quan sát=170.

**Quan sát:** Thất bại trước khi ghi nhận CONNECT hoàn tất/socket origin. Không có nativeCode và chưa có HTTP status ở các case mẫu.

**Chưa biết/giới hạn:** Chưa phân biệt được DNS tới proxy, TCP tới proxy, đóng sớm hay timeout tunnel. Tuyệt đối không đổi nhóm này thành ECONNRESET.

**Hướng xử lý:** Bổ sung cause.code/errno/syscall và timing DNS/TCP/CONNECT của agent; kiểm tra proxy-manager/provider log theo endpoint hash và giờ case.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `proxy_connect` |
| originalReason | `NETWORK_ERROR` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `bootstrap` |
| query | `bootstrap` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `c3fd0770d15b21dceb68812936a16ac751d39c60ba765dd89ed3eb9cee65a391`; event ID: `536fdc8d-e66c-48f1-9459-7df19f662475`.
- Thời điểm: **30/10/2026 02:28:34.499 ICT**; mức `read_retry`; retry đã ghi: `3`.
- Source: [https://www.facebook.com/100001010596262](https://www.facebook.com/100001010596262).
- Request route: `https://www.facebook.com/100001010596262`.
- elapsedMs=20943; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `840bd17f4157c8e00bb17a0c9abf91aa3a9ca5c8a821253b1fae93d37bf51400` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_connect / error | None / None | false | — | — | 20943 | 0 / None | — | — |

### Case 2

- Job ID: `24d47f567de8970d410e66cb4280ffebf2d9ef63029439dfbfb9944a49008b47`; event ID: `e7a3aa2c-1d6e-4318-b183-a31d35f77525`.
- Thời điểm: **30/10/2026 02:58:36.929 ICT**; mức `read_retry`; retry đã ghi: `3`.
- Source: [https://www.facebook.com/100002986470369](https://www.facebook.com/100002986470369).
- Request route: `https://www.facebook.com/100002986470369`.
- elapsedMs=21194; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `affaf876df2d020091c10b062f561aae049fbed6c8785dde7a22374eab9bcdf7` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_connect / error | None / None | false | — | — | 21194 | 0 / None | — | — |

## G047 — youtube-comment / UPSTREAM_NETWORK_ERROR

`UPSTREAM_NETWORK_ERROR__RESPONSE_HEADERS__ECONNRESET__COMMENTS`

Group key: `248d1f7e7b9f4cd86f69506426666cc030535a0af1b69aaef10a7b0d1dc9ca34`. Lần đầu 30/10/2026 00:54:55.297; lần cuối 30/10/2026 03:59:34.159.

**Số ghi nhận riêng từng mức:** RQ=78; RT=78; RF=0; JF=0. Tổng bản ghi quan sát=156.

**Quan sát:** Socket/TLS đã được cấp (nhiều case là socket tái sử dụng) nhưng bị reset trước khi có HTTP header.

**Chưa biết/giới hạn:** Chưa có HTTP status; không được gán thành lỗi TLS handshake hay lỗi nhận body. Có thể liên quan socket reuse, nhưng mẫu chưa chứng minh nguyên nhân.

**Hướng xử lý:** So sánh reusedSocket=true/false và vòng đời keep-alive cùng route; giữ riêng khỏi TLS và body, không tăng retry mù.

| Thuộc tính | Giá trị |
|---|---|
| platform | `youtube` |
| phase | `response_headers` |
| originalReason | `UPSTREAM_NETWORK_ERROR` |
| nativeCode | `ECONNRESET` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `comments` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `90d092301c1c266e286332326246d279d79705471051dfd8e9855e8fac92ea6d`; event ID: `897bcb31-5b86-4376-b5a1-94bb98b75ce2`.
- Thời điểm: **30/10/2026 01:42:05.047 ICT**; mức `request_error`; retry đã ghi: `0`.
- Source: [https://www.youtube.com/channel/UC7MGCyKDw8iQX7Vs0-BH9uA](https://www.youtube.com/channel/UC7MGCyKDw8iQX7Vs0-BH9uA).
- Post: [https://www.youtube.com/watch?v=wKg_WbgBZZ8](https://www.youtube.com/watch?v=wKg_WbgBZZ8).
- Request route: `https://www.youtube.com/youtubei/v1/next`.
- elapsedMs=677; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `a12f5bf8fec29ae1aa8446f8c4fc8025fee2bbc166ae81e00cb146da2531edb7` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 7 | response_headers / error | None / None | true | 0 | — | 677 | 0 / None | — | ECONNRESET |

### Case 2

- Job ID: `a48e72a80fbd3aa1cf6719a07b7f080a0e361a45b186fd7f7d5a3846508a2864`; event ID: `3cf1d520-b3ca-462c-8405-a550d4bd0ded`.
- Thời điểm: **30/10/2026 03:59:32.623 ICT**; mức `request_error`; retry đã ghi: `3`.
- Source: [https://www.youtube.com/channel/UCljFFNaQoJWeP91Bz4m_3bw](https://www.youtube.com/channel/UCljFFNaQoJWeP91Bz4m_3bw).
- Post: [https://www.youtube.com/watch?v=DsLENHJrEgs](https://www.youtube.com/watch?v=DsLENHJrEgs).
- Request route: `https://www.youtube.com/youtubei/v1/next`.
- elapsedMs=657; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `dbb1e32e5f920e42d798bde24ffe5887247477b26e901f623f2c9357b46789eb` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 2 | response_headers / error | None / None | true | 0 | — | 657 | 0 / None | — | ECONNRESET |

## G048 — youtube-source / UPSTREAM_TIMEOUT

`UPSTREAM_TIMEOUT__UNOBSERVED__SOURCE`

Group key: `d2e0717e487c220bc50e9dd7011cb6132686b73c73946360e226b46f9de1b761`. Lần đầu 30/10/2026 00:49:53.449; lần cuối 30/10/2026 03:56:43.445.

**Số ghi nhận riêng từng mức:** RQ=0; RT=149; RF=1; JF=0. Tổng bản ghi quan sát=150.

**Quan sát:** Hết thời gian của lượt đọc, nhưng không có networkTimings để định vị đến DNS/CONNECT/TLS/header/body.

**Chưa biết/giới hạn:** UPSTREAM_TIMEOUT là mã tổng hợp của ứng dụng; không phải bằng chứng native ETIMEDOUT. Không có elapsedMs ở các case này.

**Hướng xử lý:** Bổ sung trace trước acquisition/permit/request và giữ timing khi dispose/timeout. Giữ nhóm UNOBSERVED riêng; dùng job ID/cursor của case để tái hiện, không gán nguyên nhân cho proxy.

| Thuộc tính | Giá trị |
|---|---|
| platform | `youtube` |
| phase | `unobserved` |
| originalReason | `UPSTREAM_TIMEOUT` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `—` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `cace11e70cbf785fa3ff59f45c6ce13a4eb1d40b23513ed7cc7114475fdb787c`; event ID: `58b38523-29a6-4b9d-a83d-7f3c2cdcdb4a`.
- Thời điểm: **30/10/2026 00:49:53.449 ICT**; mức `read_retry`; retry đã ghi: `11`.
- Source: [https://www.youtube.com/channel/UCHCos7l5Nol2OZfFFkDXckg](https://www.youtube.com/channel/UCHCos7l5Nol2OZfFFkDXckg).
- Request route: `—`.
- elapsedMs=—; wireBytes=—; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `69a81c8b5a5f0214f5716df7669560ea18ded4f5dbdab609d2bcaeb05aab8358` (không phải địa chỉ/credential proxy).
- Checkpoint/coverage giữ lại: `{"proxyRetries": 100, "coverage": {"recoveries": 0, "scope": "anonymous_public_response", "exhausted": false, "complete": false, "observedUnique": 30}, "pagination": {"hasMore": true, "complete": false, "reason": "HTTP_PAGE_BUDGET"}}`. Đây là observed coverage, chưa phải xác nhận ES lưu tất cả item.

Không có wire timing trong case này; không suy đoán DNS/TCP/TLS/HTTP stage từ elapsed bị thiếu.

### Case 2

- Job ID: `a75f850dc0b65f492420fc2ac7909cc7f1a130d2dcd1825469a19ac904897fc5`; event ID: `c9ab4a02-754f-4342-8a4b-dfc4a03bb113`.
- Thời điểm: **30/10/2026 01:03:51.870 ICT**; mức `read_retry`; retry đã ghi: `4`.
- Source: [https://www.youtube.com/channel/UCIg56SgvoZF8Qg0Jx_gh6Pg](https://www.youtube.com/channel/UCIg56SgvoZF8Qg0Jx_gh6Pg).
- Request route: `—`.
- elapsedMs=—; wireBytes=—; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `c4c496517ce8743ec78b17cde82ddaabe81613fdcdc6840d7f2346964decac75` (không phải địa chỉ/credential proxy).
- Checkpoint/coverage giữ lại: `{"proxyRetries": 100, "coverage": {"recoveries": 0, "scope": "anonymous_public_response", "exhausted": false, "complete": false, "observedUnique": 30}, "pagination": {"hasMore": true, "complete": false, "reason": "HTTP_PAGE_BUDGET"}}`. Đây là observed coverage, chưa phải xác nhận ES lưu tất cả item.

Không có wire timing trong case này; không suy đoán DNS/TCP/TLS/HTTP stage từ elapsed bị thiếu.

## G049 — facebook-page-source / UPSTREAM_TIMEOUT

`UPSTREAM_TIMEOUT__UNOBSERVED__SOURCE`

Group key: `712d284a95929546f83e33a640f41e3892e83a632d559d54b32470b77cc57a78`. Lần đầu 30/10/2026 00:49:56.961; lần cuối 30/10/2026 04:00:01.070.

**Số ghi nhận riêng từng mức:** RQ=0; RT=148; RF=0; JF=0. Tổng bản ghi quan sát=148.

**Quan sát:** Hết thời gian của lượt đọc, nhưng không có networkTimings để định vị đến DNS/CONNECT/TLS/header/body.

**Chưa biết/giới hạn:** UPSTREAM_TIMEOUT là mã tổng hợp của ứng dụng; không phải bằng chứng native ETIMEDOUT. Không có elapsedMs ở các case này.

**Hướng xử lý:** Bổ sung trace trước acquisition/permit/request và giữ timing khi dispose/timeout. Giữ nhóm UNOBSERVED riêng; dùng job ID/cursor của case để tái hiện, không gán nguyên nhân cho proxy.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `unobserved` |
| originalReason | `UPSTREAM_TIMEOUT` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `—` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `4134ed5b06179581cdc96b3489bb07b133902b272c71025860f4ec36bf2a4926`; event ID: `4979a1f6-aa20-48aa-87be-9bbfad84a73e`.
- Thời điểm: **30/10/2026 01:12:59.088 ICT**; mức `read_retry`; retry đã ghi: `1`.
- Source: [https://www.facebook.com/488027394581397](https://www.facebook.com/488027394581397).
- Request route: `—`.
- elapsedMs=—; wireBytes=—; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `01a01fd0e59c6a8b21005bfea6b6b918dde95729dadb2b3e9f73a7202e51cbc2` (không phải địa chỉ/credential proxy).

Không có wire timing trong case này; không suy đoán DNS/TCP/TLS/HTTP stage từ elapsed bị thiếu.

### Case 2

- Job ID: `2173331105df7618d48dc3fa7e67b1d233d1fa8e1995ce9f897269be1f7dbf98`; event ID: `75df3505-f0e6-41ae-86a7-b408047e04e8`.
- Thời điểm: **30/10/2026 03:34:07.103 ICT**; mức `read_retry`; retry đã ghi: `3`.
- Source: [https://www.facebook.com/1715745595382765](https://www.facebook.com/1715745595382765).
- Request route: `—`.
- elapsedMs=—; wireBytes=—; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `cb55289f5b8ad84994086136c79263e50311c9718d73a7c1afd46f69fcfc4916` (không phải địa chỉ/credential proxy).

Không có wire timing trong case này; không suy đoán DNS/TCP/TLS/HTTP stage từ elapsed bị thiếu.

## G050 — youtube-comment / UPSTREAM_TIMEOUT

`UPSTREAM_TIMEOUT__UNOBSERVED__COMMENTS`

Group key: `df150428a206ded67b8db77ff75d70a25d768a2af88f617a3d27253e071e0f05`. Lần đầu 30/10/2026 00:49:59.672; lần cuối 30/10/2026 03:59:44.454.

**Số ghi nhận riêng từng mức:** RQ=0; RT=115; RF=0; JF=0. Tổng bản ghi quan sát=115.

**Quan sát:** Hết thời gian của lượt đọc, nhưng không có networkTimings để định vị đến DNS/CONNECT/TLS/header/body.

**Chưa biết/giới hạn:** UPSTREAM_TIMEOUT là mã tổng hợp của ứng dụng; không phải bằng chứng native ETIMEDOUT. Không có elapsedMs ở các case này.

**Hướng xử lý:** Bổ sung trace trước acquisition/permit/request và giữ timing khi dispose/timeout. Giữ nhóm UNOBSERVED riêng; dùng job ID/cursor của case để tái hiện, không gán nguyên nhân cho proxy.

| Thuộc tính | Giá trị |
|---|---|
| platform | `youtube` |
| phase | `unobserved` |
| originalReason | `UPSTREAM_TIMEOUT` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `comments` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `—` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `f0a0a19982e0c8144b6962022e5d5e642f84fb085576cac1ac73e9c903d8502a`; event ID: `d469c044-23c4-4828-b077-4e128efbeb12`.
- Thời điểm: **30/10/2026 01:18:28.041 ICT**; mức `read_retry`; retry đã ghi: `2`.
- Source: [https://www.youtube.com/channel/UCZQdpU9kfmwzYuKJWrb_1Hw](https://www.youtube.com/channel/UCZQdpU9kfmwzYuKJWrb_1Hw).
- Post: [https://www.youtube.com/watch?v=hx3mlQw1VnI](https://www.youtube.com/watch?v=hx3mlQw1VnI).
- Request route: `—`.
- elapsedMs=—; wireBytes=—; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `69a81c8b5a5f0214f5716df7669560ea18ded4f5dbdab609d2bcaeb05aab8358` (không phải địa chỉ/credential proxy).

Không có wire timing trong case này; không suy đoán DNS/TCP/TLS/HTTP stage từ elapsed bị thiếu.

### Case 2

- Job ID: `d7ca1e9e2a6d1f9500178172a0f17a944df41045174704348116fa1c968dece9`; event ID: `2de9be0f-bed8-493b-9a5e-69d76bc0c966`.
- Thời điểm: **30/10/2026 03:41:05.271 ICT**; mức `read_retry`; retry đã ghi: `2`.
- Source: [https://www.youtube.com/channel/UCf2LomK7v6C9XOennDpMtGA](https://www.youtube.com/channel/UCf2LomK7v6C9XOennDpMtGA).
- Post: [https://www.youtube.com/watch?v=_w8I92DuEgU](https://www.youtube.com/watch?v=_w8I92DuEgU).
- Request route: `—`.
- elapsedMs=—; wireBytes=—; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `6435ac2d8b512f971652983ba5bdded2f76be7ba79bdecea77c799dd8f0b900c` (không phải địa chỉ/credential proxy).

Không có wire timing trong case này; không suy đoán DNS/TCP/TLS/HTTP stage từ elapsed bị thiếu.

## G051 — threads-comment / UPSTREAM_HTTP_429

`UPSTREAM_HTTP_429__HTTP_RESPONSE__HTTP_429__COMMENTS`

Group key: `42ae2d9b108d859051f7affb1eb7c264bc2ebc89dc6b96db7c0887f8fa939ed4`. Lần đầu 30/10/2026 00:50:57.833; lần cuối 30/10/2026 03:55:39.361.

**Số ghi nhận riêng từng mức:** RQ=47; RT=47; RF=0; JF=0. Tổng bản ghi quan sát=94.

**Quan sát:** Platform request trả HTTP 429; body được chủ động bỏ đọc để nhả tài nguyên nhanh. Đây không phải proxy CONNECT 429.

**Chưa biết/giới hạn:** wireComplete=false ở các case này không chứng minh lỗi truyền body: code cố ý dừng body của 429. Chưa có bằng chứng lỗi giới hạn theo một IP cụ thể.

**Hướng xử lý:** Đối chiếu Retry-After và giới hạn theo platform/operation; xem lại việc xoay proxy lặp liên tục với policy hiện tại. Không quarantine proxy chỉ từ origin HTTP 429.

| Thuộc tính | Giá trị |
|---|---|
| platform | `threads` |
| phase | `http_response` |
| originalReason | `UPSTREAM_HTTP_429` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `429` |
| apiCode | `—` |
| operation | `comments` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `false` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `7565b740354c999ef1363cee9a65fc9ed44a2c906b65ecef61b3fc2875584639`; event ID: `89fa77aa-cd1c-4ddc-ab2e-b22ce7d98e8c`.
- Thời điểm: **30/10/2026 00:50:57.833 ICT**; mức `request_error`; retry đã ghi: `2`.
- Source: [https://www.threads.com/@nltvlbsh.nhn.vb](https://www.threads.com/@nltvlbsh.nhn.vb).
- Post: [https://www.threads.com/@nltvlbsh.nhn.vb/post/DfCLojEDVQY](https://www.threads.com/@nltvlbsh.nhn.vb/post/DfCLojEDVQY).
- Request route: `—`.
- elapsedMs=522; wireBytes=0; decodedBytes=—; wireComplete=false.
- Proxy endpoint hash: `632b7efa8c7957d1bc73e54ed16afbe3ab31063beb563ee539c83a3329320f45` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 2 | complete / complete | 429 / None | true | 1 | 522 | 522 | 0 / None | false | — |

### Case 2

- Job ID: `dbad913a59bc819c1f64f276ff547a7667998ff6bae1837584a514bf85800e18`; event ID: `87215831-5639-44f9-8b6f-570f3bba414c`.
- Thời điểm: **30/10/2026 02:34:24.626 ICT**; mức `request_error`; retry đã ghi: `17`.
- Source: [https://www.threads.com/@thegioididong_official/](https://www.threads.com/@thegioididong_official/).
- Post: [https://www.threads.com/@thegioididong_official/post/DfCd21jEucw](https://www.threads.com/@thegioididong_official/post/DfCd21jEucw).
- Request route: `—`.
- elapsedMs=605; wireBytes=0; decodedBytes=—; wireComplete=false.
- Proxy endpoint hash: `ce4a66066f5431f40d815cc0ad4ebdaee32e61e699f1f4e78b685a830d4d8009` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 3 | complete / complete | 429 / None | true | 1 | 605 | 605 | 0 / None | false | — |

## G052 — facebook-comment / AUTH_REQUIRED

`AUTH_REQUIRED__HTTP_RESPONSE__HTTP_200__BR__BOOTSTRAP__BOOTSTRAP`

Group key: `de290c1a04d9e1f44fbd9e09319234557c41382a5b1866afc69a155aece3bca9`. Lần đầu 30/10/2026 01:57:45.867; lần cuối 30/10/2026 02:59:44.587.

**Số ghi nhận riêng từng mức:** RQ=0; RT=70; RF=9; JF=0. Tổng bản ghi quan sát=79.

**Quan sát:** HTTP 200 đã nhận đủ body; reader nhận diện nội dung yêu cầu đăng nhập tại bootstrap. Đây là cổng xác thực ở mức nội dung, không phải HTTP 401 hay reset socket.

**Chưa biết/giới hạn:** Toàn bộ mẫu auth trong cửa sổ có confirmed=false; một số xuất hiện sau khi đã có dữ liệu công khai. Chưa chứng minh source private, proxy bị chặn, hay template chắc chắn sai.

**Hướng xử lý:** Đối chiếu cùng source qua endpoint khác bằng phiên anonymous sạch và giữ dấu hiệu login/route đã khử bí mật. Tách trường hợp ban đầu với sau dữ liệu công khai; không gắn nhãn private chỉ từ login page.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `http_response` |
| originalReason | `AUTH_REQUIRED` |
| nativeCode | `—` |
| connectStatus | `200` |
| httpStatus | `200` |
| apiCode | `—` |
| operation | `bootstrap` |
| query | `bootstrap` |
| stage | `—` |
| bodyEncoding | `br` |
| wireComplete | `true` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `6dc32fe02d8540dd2aa2f3c2063982d437899bdb3ab6b39e72f0f2cfdb2d798b`; event ID: `5cf54dae-cd85-4457-aad6-8c10cbd16406`.
- Thời điểm: **30/10/2026 02:55:47.690 ICT**; mức `read_retry`; retry đã ghi: `1`.
- Source: [https://www.facebook.com/groups/1580111125453127](https://www.facebook.com/groups/1580111125453127).
- Post: [https://www.facebook.com/1580111125453127_4318401728290706](https://www.facebook.com/1580111125453127_4318401728290706).
- Request route: `—`.
- elapsedMs=7812; wireBytes=75009; decodedBytes=363295; wireComplete=true.
- Proxy endpoint hash: `2becb4985e92d60fe4ef9e97d04f2f9c303e486e180844eaab3f716aae6f9533` (không phải địa chỉ/credential proxy).
- Auth evidence: `{"classification": "unverified", "confirmed": false, "stage": "initial", "evidence": "anonymous_login_or_checkpoint"}`.

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 302 / 200 | false | 1464 | 2222 | 11697 | 0 / None | true | — |
| 2 | complete / complete | 302 / None | true | 0 | 1149 | 9109 | 0 / None | true | — |
| 3 | complete / complete | 200 / 200 | false | 1691 | 2382 | 7812 | 75009 / 363295 | true | — |

### Case 2

- Job ID: `e8cf4573600d0dafac8e017f2621412a7fcc28b1609f3323df421cd8deb75c3b`; event ID: `bd46dc0d-421c-4db3-84e1-bc78fb006ffe`.
- Thời điểm: **30/10/2026 02:56:15.825 ICT**; mức `read_retry`; retry đã ghi: `1`.
- Source: [https://www.facebook.com/groups/159646208877218](https://www.facebook.com/groups/159646208877218).
- Post: [https://www.facebook.com/159646208877218_1463110368530789](https://www.facebook.com/159646208877218_1463110368530789).
- Request route: `—`.
- elapsedMs=8322; wireBytes=75018; decodedBytes=363301; wireComplete=true.
- Proxy endpoint hash: `2becb4985e92d60fe4ef9e97d04f2f9c303e486e180844eaab3f716aae6f9533` (không phải địa chỉ/credential proxy).
- Auth evidence: `{"classification": "unverified", "confirmed": false, "stage": "initial", "evidence": "anonymous_login_or_checkpoint"}`.

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 302 / 200 | false | 2026 | 2595 | 13283 | 0 / None | true | — |
| 2 | complete / complete | 302 / None | true | 1 | 792 | 9932 | 0 / None | true | — |
| 3 | complete / complete | 200 / 200 | false | 1698 | 2408 | 8322 | 75018 / 363301 | true | — |

## G053 — youtube-comment / PUBLIC_ITEMS_NOT_RETURNED

`PUBLIC_ITEMS_NOT_RETURNED__HTTP_RESPONSE__HTTP_200__BR__COMMENTS`

Group key: `2ae3579a8f651dd4e37f1b6056976c6d29fa6b062e89c7c0850af2a885d2c944`. Lần đầu 30/10/2026 00:49:26.918; lần cuối 30/10/2026 03:55:57.793.

**Số ghi nhận riêng từng mức:** RQ=0; RT=0; RF=74; JF=0. Tổng bản ghi quan sát=74.

**Quan sát:** Reader không nhận được các item công khai mong đợi tại operation comments dù HTTP 200; job kết thúc theo policy.

**Chưa biết/giới hạn:** Có thể là không có dữ liệu trong phạm vi đọc, gate, cấu trúc khác hoặc thiếu item; telemetry hiện tại chưa chứng minh riêng nguyên nhân nào.

**Hướng xử lý:** Đối chiếu native end/empty proof, identity, publication window và container item trong case. Không coi HTTP 200 hay việc job completed là bằng chứng crawl đủ.

| Thuộc tính | Giá trị |
|---|---|
| platform | `youtube` |
| phase | `http_response` |
| originalReason | `PUBLIC_ITEMS_NOT_RETURNED` |
| nativeCode | `—` |
| connectStatus | `200` |
| httpStatus | `200` |
| apiCode | `—` |
| operation | `comments` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `br` |
| wireComplete | `true` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `6c4e187d810c4e6da0513309a7e13d497925ee6bbf2237a6d9483bd76b4d6441`; event ID: `ae94cc9a-2529-41d0-ab86-d7e767225e37`.
- Thời điểm: **30/10/2026 00:57:17.543 ICT**; mức `read_failure`; retry đã ghi: `0`.
- Source: [https://www.youtube.com/channel/UCOEvEldWBMOHNdlzcofFa9w](https://www.youtube.com/channel/UCOEvEldWBMOHNdlzcofFa9w).
- Post: [https://www.youtube.com/watch?v=8jmlDlC8mPQ](https://www.youtube.com/watch?v=8jmlDlC8mPQ).
- Request route: `—`.
- elapsedMs=30989; wireBytes=124185; decodedBytes=1260178; wireComplete=true.
- Proxy endpoint hash: `affaf876df2d020091c10b062f561aae049fbed6c8785dde7a22374eab9bcdf7` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 200 / 200 | false | 2346 | 3184 | 30989 | 124185 / 1260178 | true | — |

### Case 2

- Job ID: `93d46b2381cd109e0ef141f9c8f8c1ec7568b35e6946516565a1d24f7c7d8f58`; event ID: `172c4cdd-a7dd-408e-8438-eca1f26662b7`.
- Thời điểm: **30/10/2026 01:08:23.603 ICT**; mức `read_failure`; retry đã ghi: `2`.
- Source: [https://www.youtube.com/channel/UCfsBLXEWNtr26TM2LLpKbGQ](https://www.youtube.com/channel/UCfsBLXEWNtr26TM2LLpKbGQ).
- Post: [https://www.youtube.com/watch?v=2tdAjbA4xLs](https://www.youtube.com/watch?v=2tdAjbA4xLs).
- Request route: `—`.
- elapsedMs=39345; wireBytes=129794; decodedBytes=1412795; wireComplete=true.
- Proxy endpoint hash: `b4aa5e353b18d757dec0bd61df049797b4ae99dd1254a9dc4a5bd4cca7f476e0` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 200 / 200 | false | 2947 | 3724 | 39345 | 129794 / 1412795 | true | — |

## G054 — facebook-group-source / UPSTREAM_NETWORK_ERROR

`UPSTREAM_NETWORK_ERROR__RESPONSE_HEADERS__ECONNRESET__SOURCE`

Group key: `ebade70b7ee6eb49e169623066bdc141babf357fea44c85c894c6d8aa845b8db`. Lần đầu 30/10/2026 00:47:44.263; lần cuối 30/10/2026 03:57:49.034.

**Số ghi nhận riêng từng mức:** RQ=70; RT=0; RF=0; JF=0. Tổng bản ghi quan sát=70.

**Quan sát:** Socket/TLS đã được cấp (nhiều case là socket tái sử dụng) nhưng bị reset trước khi có HTTP header.

**Chưa biết/giới hạn:** Chưa có HTTP status; không được gán thành lỗi TLS handshake hay lỗi nhận body. Có thể liên quan socket reuse, nhưng mẫu chưa chứng minh nguyên nhân.

**Hướng xử lý:** So sánh reusedSocket=true/false và vòng đời keep-alive cùng route; giữ riêng khỏi TLS và body, không tăng retry mù.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `response_headers` |
| originalReason | `UPSTREAM_NETWORK_ERROR` |
| nativeCode | `ECONNRESET` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `2902a823d68ff3ed892b0d0d7799c01953e656a8afd05b44e6464ce9a09de813`; event ID: `c9cfbd9c-17e9-4653-8cf9-ab843055c1f7`.
- Thời điểm: **30/10/2026 01:19:07.106 ICT**; mức `request_error`; retry đã ghi: `2`.
- Source: [https://www.facebook.com/groups/214541189974470](https://www.facebook.com/groups/214541189974470).
- Request route: `https://www.facebook.com/api/graphql/`.
- elapsedMs=515; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `04008c14c6432cfd675d31322da8f6f3a9968c5f7b630ce1212c5f7335a8e408` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 2 | response_headers / error | None / None | true | 1 | — | 515 | 0 / None | — | ECONNRESET |

### Case 2

- Job ID: `c7e34d42ddd4d4119a42962ca94b693307dbe00ff4c20970bf33c9302de1c6a9`; event ID: `1e94ea7e-2882-4eea-8fac-1cbac734888e`.
- Thời điểm: **30/10/2026 01:33:51.719 ICT**; mức `request_error`; retry đã ghi: `4`.
- Source: [https://www.facebook.com/groups/234266422010846](https://www.facebook.com/groups/234266422010846).
- Request route: `https://www.facebook.com/api/graphql/`.
- elapsedMs=372; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `0a756cc5269ddfeca9187549e4546bd9c970856378e8dd1409becf11b3d9a818` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 2 | response_headers / error | None / None | true | 1 | — | 372 | 0 / None | — | ECONNRESET |

## G055 — facebook-group-source / NETWORK_ERROR

`NETWORK_ERROR__RESPONSE_HEADERS__ECONNRESET__SOURCE`

Group key: `ce88b913589a4768de1c495582e591dc32a09061fdbbca9841e50f769bf449b1`. Lần đầu 30/10/2026 00:47:44.470; lần cuối 30/10/2026 03:57:49.261.

**Số ghi nhận riêng từng mức:** RQ=0; RT=70; RF=0; JF=0. Tổng bản ghi quan sát=70.

**Quan sát:** Socket/TLS đã được cấp (nhiều case là socket tái sử dụng) nhưng bị reset trước khi có HTTP header.

**Chưa biết/giới hạn:** Chưa có HTTP status; không được gán thành lỗi TLS handshake hay lỗi nhận body. Có thể liên quan socket reuse, nhưng mẫu chưa chứng minh nguyên nhân.

**Hướng xử lý:** So sánh reusedSocket=true/false và vòng đời keep-alive cùng route; giữ riêng khỏi TLS và body, không tăng retry mù.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `response_headers` |
| originalReason | `NETWORK_ERROR` |
| nativeCode | `ECONNRESET` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `b3d9200c89038042a777a2dd2866a408eac8274c6636fe8a6836820b6d471ceb`; event ID: `cd4d9aa7-2df6-4f8c-9d56-3c8e05a1078b`.
- Thời điểm: **30/10/2026 01:00:26.825 ICT**; mức `read_retry`; retry đã ghi: `4`.
- Source: [https://www.facebook.com/groups/1936244313302748](https://www.facebook.com/groups/1936244313302748).
- Request route: `https://www.facebook.com/api/graphql/`.
- elapsedMs=475; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `840bd17f4157c8e00bb17a0c9abf91aa3a9ca5c8a821253b1fae93d37bf51400` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 7 | response_headers / error | None / None | true | 1 | — | 475 | 0 / None | — | ECONNRESET |

### Case 2

- Job ID: `543c19a1f3ea68f2ea2f60404b701933fb4cebda346baf5374d6ecd695e1f46b`; event ID: `7832337a-e0d3-49f3-8b02-6d50db41b303`.
- Thời điểm: **30/10/2026 01:22:23.306 ICT**; mức `read_retry`; retry đã ghi: `2`.
- Source: [https://www.facebook.com/groups/220967841692600](https://www.facebook.com/groups/220967841692600).
- Request route: `https://www.facebook.com/api/graphql/`.
- elapsedMs=305; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `1fbeb8474d73a6439b60037b69c1195e87ff741c1426c79cf23224b16b7f2c58` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 3 | response_headers / error | None / None | true | 0 | — | 305 | 0 / None | — | ECONNRESET |

## G056 — instagram-source / UPSTREAM_TIMEOUT

`UPSTREAM_TIMEOUT__READ_WORK__UPSTREAM_TIMEOUT__SOURCE`

Group key: `63856d878a00a209348048ed906392e9929a0bc7724b4ccda45b8c0c4fdcf330`. Lần đầu 30/10/2026 00:50:30.454; lần cuối 30/10/2026 03:53:11.520.

**Số ghi nhận riêng từng mức:** RQ=0; RT=62; RF=0; JF=0. Tổng bản ghi quan sát=62.

**Quan sát:** Lượt đọc chạm timeout tại read_work; transport có mã UPSTREAM_TIMEOUT và không có HTTP response hoàn chỉnh gắn cho lỗi.

**Chưa biết/giới hạn:** read_work chưa tách được bước con trong adapter; chưa có bằng chứng errno của socket.

**Hướng xử lý:** Tách budget toàn lượt với timeout từng request/permit và thêm stage con; so checkpoint đang giữ trước khi thay đổi timeout.

| Thuộc tính | Giá trị |
|---|---|
| platform | `instagram` |
| phase | `read_work` |
| originalReason | `UPSTREAM_TIMEOUT` |
| nativeCode | `UPSTREAM_TIMEOUT` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `—` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `45cf8cba0ae14bf638c31492ad2fe8ea876a1b801177c15783b7a9f7c20e33f2`; event ID: `b6d42594-6c4b-42af-8ae1-b39d9c4d9f64`.
- Thời điểm: **30/10/2026 01:15:16.422 ICT**; mức `read_retry`; retry đã ghi: `2`.
- Source: [https://www.instagram.com/gs25vietnam/](https://www.instagram.com/gs25vietnam/).
- Request route: `—`.
- elapsedMs=—; wireBytes=—; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `95596101280f3fe35027a8c45359a828b7ef8262f3814efbf3d4224be8e7ecb4` (không phải địa chỉ/credential proxy).

Không có wire timing trong case này; không suy đoán DNS/TCP/TLS/HTTP stage từ elapsed bị thiếu.

### Case 2

- Job ID: `1e1aaa0069ae86a2fdd61fe220934984fa281fbb6f0b9afc1f9f856bd72d8afe`; event ID: `80daee87-2d89-40ef-94bf-a9bcb9baba06`.
- Thời điểm: **30/10/2026 01:19:32.387 ICT**; mức `read_retry`; retry đã ghi: `1`.
- Source: [https://www.instagram.com/soundcorevietnam/](https://www.instagram.com/soundcorevietnam/).
- Request route: `—`.
- elapsedMs=—; wireBytes=—; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `95596101280f3fe35027a8c45359a828b7ef8262f3814efbf3d4224be8e7ecb4` (không phải địa chỉ/credential proxy).

Không có wire timing trong case này; không suy đoán DNS/TCP/TLS/HTTP stage từ elapsed bị thiếu.

## G057 — facebook-group-source / AUTH_REQUIRED

`AUTH_REQUIRED__HTTP_RESPONSE__HTTP_200__BR__BOOTSTRAP__BOOTSTRAP`

Group key: `3f4634bdf4b7c1be494d77065ea344caf0ee0045100990dbbecbd6b5858a2a6d`. Lần đầu 30/10/2026 01:39:31.930; lần cuối 30/10/2026 02:56:37.113.

**Số ghi nhận riêng từng mức:** RQ=0; RT=46; RF=13; JF=0. Tổng bản ghi quan sát=59.

**Quan sát:** HTTP 200 đã nhận đủ body; reader nhận diện nội dung yêu cầu đăng nhập tại bootstrap. Đây là cổng xác thực ở mức nội dung, không phải HTTP 401 hay reset socket.

**Chưa biết/giới hạn:** Toàn bộ mẫu auth trong cửa sổ có confirmed=false; một số xuất hiện sau khi đã có dữ liệu công khai. Chưa chứng minh source private, proxy bị chặn, hay template chắc chắn sai.

**Hướng xử lý:** Đối chiếu cùng source qua endpoint khác bằng phiên anonymous sạch và giữ dấu hiệu login/route đã khử bí mật. Tách trường hợp ban đầu với sau dữ liệu công khai; không gắn nhãn private chỉ từ login page.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `http_response` |
| originalReason | `AUTH_REQUIRED` |
| nativeCode | `—` |
| connectStatus | `200` |
| httpStatus | `200` |
| apiCode | `—` |
| operation | `bootstrap` |
| query | `bootstrap` |
| stage | `—` |
| bodyEncoding | `br` |
| wireComplete | `true` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `631eff45dbbfe82d0b51e392ba4b3b0a32a0a32162a13eb22b31340002d4f739`; event ID: `6ea8422f-4d36-482f-a36c-c3996815a936`.
- Thời điểm: **30/10/2026 02:49:35.413 ICT**; mức `read_failure`; retry đã ghi: `3`.
- Source: [https://www.facebook.com/groups/373590233068802](https://www.facebook.com/groups/373590233068802).
- Request route: `—`.
- elapsedMs=12869; wireBytes=75643; decodedBytes=364758; wireComplete=true.
- Proxy endpoint hash: `2becb4985e92d60fe4ef9e97d04f2f9c303e486e180844eaab3f716aae6f9533` (không phải địa chỉ/credential proxy).
- Auth evidence: `{"classification": "unverified", "confirmed": false, "stage": "initial", "evidence": "anonymous_login_or_checkpoint"}`.

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 302 / 200 | false | 2171 | 3013 | 17756 | 0 / None | true | — |
| 2 | complete / complete | 302 / None | true | 0 | 866 | 14011 | 0 / None | true | — |
| 3 | complete / complete | 200 / 200 | false | 2099 | 2915 | 12869 | 75643 / 364758 | true | — |

### Case 2

- Job ID: `d821f0322e7655936304cf15e84114546b64eb6dd6448939a958208a2cf97822`; event ID: `76765c27-ce86-4993-b6d9-1e2f806d85c2`.
- Thời điểm: **30/10/2026 02:52:13.768 ICT**; mức `read_failure`; retry đã ghi: `3`.
- Source: [https://www.facebook.com/groups/380084470060541](https://www.facebook.com/groups/380084470060541).
- Request route: `—`.
- elapsedMs=15030; wireBytes=75634; decodedBytes=364639; wireComplete=true.
- Proxy endpoint hash: `2becb4985e92d60fe4ef9e97d04f2f9c303e486e180844eaab3f716aae6f9533` (không phải địa chỉ/credential proxy).
- Auth evidence: `{"classification": "unverified", "confirmed": false, "stage": "initial", "evidence": "anonymous_login_or_checkpoint"}`.

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 302 / 200 | false | 1644 | 2222 | 19231 | 0 / None | true | — |
| 2 | complete / complete | 302 / None | true | 0 | 809 | 16417 | 0 / None | true | — |
| 3 | complete / complete | 200 / 200 | false | 2163 | 3434 | 15030 | 75634 / 364639 | true | — |

## G058 — facebook-reply / AUTH_REQUIRED

`AUTH_REQUIRED__HTTP_RESPONSE__HTTP_200__BR__BOOTSTRAP__BOOTSTRAP`

Group key: `9a5c1ea34b07cd806f42c1e4acd16e9bc8dd24ed56538f60cb9afe0b1c5d2e81`. Lần đầu 30/10/2026 01:41:43.897; lần cuối 30/10/2026 03:47:56.960.

**Số ghi nhận riêng từng mức:** RQ=0; RT=49; RF=9; JF=0. Tổng bản ghi quan sát=58.

**Quan sát:** HTTP 200 đã nhận đủ body; reader nhận diện nội dung yêu cầu đăng nhập tại bootstrap. Đây là cổng xác thực ở mức nội dung, không phải HTTP 401 hay reset socket.

**Chưa biết/giới hạn:** Toàn bộ mẫu auth trong cửa sổ có confirmed=false; một số xuất hiện sau khi đã có dữ liệu công khai. Chưa chứng minh source private, proxy bị chặn, hay template chắc chắn sai.

**Hướng xử lý:** Đối chiếu cùng source qua endpoint khác bằng phiên anonymous sạch và giữ dấu hiệu login/route đã khử bí mật. Tách trường hợp ban đầu với sau dữ liệu công khai; không gắn nhãn private chỉ từ login page.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `http_response` |
| originalReason | `AUTH_REQUIRED` |
| nativeCode | `—` |
| connectStatus | `200` |
| httpStatus | `200` |
| apiCode | `—` |
| operation | `bootstrap` |
| query | `bootstrap` |
| stage | `—` |
| bodyEncoding | `br` |
| wireComplete | `true` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `b10cce948d634c6ef50e71e82e06acfe315c0c3af8e10423e15b9674a03495ba`; event ID: `d0b63d06-3c06-4422-9f6b-fa5d39d5389d`.
- Thời điểm: **30/10/2026 02:48:28.319 ICT**; mức `read_retry`; retry đã ghi: `2`.
- Source: [https://www.facebook.com/groups/1146136506215419](https://www.facebook.com/groups/1146136506215419).
- Post: [https://www.facebook.com/1146136506215419_2383879109107813](https://www.facebook.com/1146136506215419_2383879109107813).
- Request route: `—`.
- elapsedMs=11631; wireBytes=75043; decodedBytes=363446; wireComplete=true.
- Proxy endpoint hash: `2becb4985e92d60fe4ef9e97d04f2f9c303e486e180844eaab3f716aae6f9533` (không phải địa chỉ/credential proxy).
- Auth evidence: `{"classification": "unverified", "confirmed": false, "stage": "initial", "evidence": "anonymous_login_or_checkpoint"}`.

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 302 / 200 | false | 2218 | 2747 | 15908 | 0 / None | true | — |
| 2 | complete / complete | 302 / None | true | 0 | 655 | 12630 | 0 / None | true | — |
| 3 | complete / complete | 200 / 200 | false | 2373 | 3302 | 11631 | 75043 / 363446 | true | — |

### Case 2

- Job ID: `6066917717ee67dfb9da4e6950b0692d17d51bb52f5921c0a3f7cf45e4f431f0`; event ID: `9627152d-f8aa-4e3e-bb0d-70b1a508cd7a`.
- Thời điểm: **30/10/2026 02:48:53.588 ICT**; mức `read_retry`; retry đã ghi: `2`.
- Source: [https://www.facebook.com/groups/1149856888942734](https://www.facebook.com/groups/1149856888942734).
- Post: [https://www.facebook.com/1149856888942734_2204419603486452](https://www.facebook.com/1149856888942734_2204419603486452).
- Request route: `—`.
- elapsedMs=14084; wireBytes=75142; decodedBytes=363417; wireComplete=true.
- Proxy endpoint hash: `2becb4985e92d60fe4ef9e97d04f2f9c303e486e180844eaab3f716aae6f9533` (không phải địa chỉ/credential proxy).
- Auth evidence: `{"classification": "unverified", "confirmed": false, "stage": "initial", "evidence": "anonymous_login_or_checkpoint"}`.

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 302 / 200 | false | 2476 | 3171 | 18905 | 0 / None | true | — |
| 2 | complete / complete | 302 / None | true | 0 | 968 | 15497 | 0 / None | true | — |
| 3 | complete / complete | 200 / 200 | false | 2523 | 3583 | 14084 | 75142 / 363417 | true | — |

## G059 — instagram-comment / UPSTREAM_TIMEOUT

`UPSTREAM_TIMEOUT__UNOBSERVED__COMMENTS`

Group key: `e78631a3f0e87973ad66c6e2487ab1080ad82f14bf24dc2cc7ed292c0f7a8309`. Lần đầu 30/10/2026 01:03:22.144; lần cuối 30/10/2026 03:51:33.549.

**Số ghi nhận riêng từng mức:** RQ=0; RT=50; RF=0; JF=0. Tổng bản ghi quan sát=50.

**Quan sát:** Hết thời gian của lượt đọc, nhưng không có networkTimings để định vị đến DNS/CONNECT/TLS/header/body.

**Chưa biết/giới hạn:** UPSTREAM_TIMEOUT là mã tổng hợp của ứng dụng; không phải bằng chứng native ETIMEDOUT. Không có elapsedMs ở các case này.

**Hướng xử lý:** Bổ sung trace trước acquisition/permit/request và giữ timing khi dispose/timeout. Giữ nhóm UNOBSERVED riêng; dùng job ID/cursor của case để tái hiện, không gán nguyên nhân cho proxy.

| Thuộc tính | Giá trị |
|---|---|
| platform | `instagram` |
| phase | `unobserved` |
| originalReason | `UPSTREAM_TIMEOUT` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `comments` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `—` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `f97cad3a28298e0d3c7574eaf881df6ae518ae9c9bde01135c0f4a5528de622f`; event ID: `b78f29e1-561c-4a2b-b809-acc57c89009f`.
- Thời điểm: **30/10/2026 01:37:32.414 ICT**; mức `read_retry`; retry đã ghi: `10`.
- Source: [https://www.instagram.com/misscosmointernational/](https://www.instagram.com/misscosmointernational/).
- Post: [https://www.instagram.com/p/De-13uLR-5i/](https://www.instagram.com/p/De-13uLR-5i/).
- Request route: `—`.
- elapsedMs=—; wireBytes=—; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `9e1c4ce350af423e000416c11bd26ab4624c26ab69ca4e481820f4a03a5019aa` (không phải địa chỉ/credential proxy).

Không có wire timing trong case này; không suy đoán DNS/TCP/TLS/HTTP stage từ elapsed bị thiếu.

### Case 2

- Job ID: `4486064c783afccb1cecb1f02cdf3e231a8cf80b515bee8691029b8346777f99`; event ID: `24fb6f21-8d01-4c67-9dbc-91178890b8b1`.
- Thời điểm: **30/10/2026 02:28:52.404 ICT**; mức `read_retry`; retry đã ghi: `6`.
- Source: [https://www.instagram.com/misscosmointernational/](https://www.instagram.com/misscosmointernational/).
- Post: [https://www.instagram.com/p/DfElVuZGpbl/](https://www.instagram.com/p/DfElVuZGpbl/).
- Request route: `—`.
- elapsedMs=—; wireBytes=—; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `d315f663ead47476675cf7808b99870727ed7b681348e9e8f1d79de0860408e9` (không phải địa chỉ/credential proxy).

Không có wire timing trong case này; không suy đoán DNS/TCP/TLS/HTTP stage từ elapsed bị thiếu.

## G060 — instagram-source / UPSTREAM_HTTP_429

`UPSTREAM_HTTP_429__HTTP_RESPONSE__HTTP_429__SOURCE`

Group key: `23396f70128c616c1d11c279992937ead2ed5fb5b5166879e2d997b93728a1e6`. Lần đầu 30/10/2026 00:52:18.525; lần cuối 30/10/2026 03:54:32.323.

**Số ghi nhận riêng từng mức:** RQ=23; RT=23; RF=0; JF=0. Tổng bản ghi quan sát=46.

**Quan sát:** Platform request trả HTTP 429; body được chủ động bỏ đọc để nhả tài nguyên nhanh. Đây không phải proxy CONNECT 429.

**Chưa biết/giới hạn:** wireComplete=false ở các case này không chứng minh lỗi truyền body: code cố ý dừng body của 429. Chưa có bằng chứng lỗi giới hạn theo một IP cụ thể.

**Hướng xử lý:** Đối chiếu Retry-After và giới hạn theo platform/operation; xem lại việc xoay proxy lặp liên tục với policy hiện tại. Không quarantine proxy chỉ từ origin HTTP 429.

| Thuộc tính | Giá trị |
|---|---|
| platform | `instagram` |
| phase | `http_response` |
| originalReason | `UPSTREAM_HTTP_429` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `429` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `false` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `fdbae51ab9c581890f2d6067410304ba5fb41b3b7f3139682744c64b693bc491`; event ID: `316bece8-50b5-4af5-9e96-d77d4f9d29cd`.
- Thời điểm: **30/10/2026 00:59:44.281 ICT**; mức `request_error`; retry đã ghi: `10`.
- Source: [https://www.instagram.com/cloudpot.official/](https://www.instagram.com/cloudpot.official/).
- Request route: `—`.
- elapsedMs=1003; wireBytes=0; decodedBytes=—; wireComplete=false.
- Proxy endpoint hash: `9e1c4ce350af423e000416c11bd26ab4624c26ab69ca4e481820f4a03a5019aa` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 6 | complete / complete | 429 / None | true | 1 | 1003 | 1003 | 0 / None | false | — |

### Case 2

- Job ID: `829769af44247a1fc3cdfbbbdf6ef8feb8baa4ca95265f6e6424793f7dc94be7`; event ID: `42aecd71-8216-448c-9078-1c85dff559bd`.
- Thời điểm: **30/10/2026 01:45:46.404 ICT**; mức `request_error`; retry đã ghi: `3`.
- Source: [https://www.instagram.com/thegioididong_official/](https://www.instagram.com/thegioididong_official/).
- Request route: `—`.
- elapsedMs=793; wireBytes=0; decodedBytes=—; wireComplete=false.
- Proxy endpoint hash: `affaf876df2d020091c10b062f561aae049fbed6c8785dde7a22374eab9bcdf7` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 4 | complete / complete | 429 / None | true | 1 | 793 | 793 | 0 / None | false | — |

## G061 — facebook-reply / COMMENTS_UNAVAILABLE

`COMMENTS_UNAVAILABLE__HTTP_RESPONSE__HTTP_200__BR__REPLIES__DEPTH1COMMENTSLISTPAGINATIONQUERY`

Group key: `3aea5d2f354454fc9c3bebaff91167e899bd94eea71fe0e30ce1d8c2b5279d06`. Lần đầu 30/10/2026 01:06:22.659; lần cuối 30/10/2026 03:36:41.566.

**Số ghi nhận riêng từng mức:** RQ=0; RT=0; RF=40; JF=0. Tổng bản ghi quan sát=40.

**Quan sát:** Native Facebook response không cung cấp comments/replies dùng được ở query Depth1CommentsListPaginationQuery trong HTTP 200; policy hiện tại kết thúc job.

**Chưa biết/giới hạn:** Không chứng minh comment count bằng 0, bài đã xóa hoặc source private. Chưa có raw error envelope để chốt lý do không khả dụng.

**Hướng xử lý:** Mở case tương ứng và kiểm tra native connection/error envelope, quyền anonymous và query root/reply. Giữ dữ liệu hợp lệ đã đọc; không đổi unavailable thành empty-success.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `http_response` |
| originalReason | `COMMENTS_UNAVAILABLE` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `200` |
| apiCode | `—` |
| operation | `replies` |
| query | `Depth1CommentsListPaginationQuery` |
| stage | `—` |
| bodyEncoding | `br` |
| wireComplete | `true` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `ab10565f3a7a3c2da60d50262a44b465bec8f3b48f3210983de078c65214533e`; event ID: `4b20a52e-b47d-4fea-bee8-b9d8cc112c7a`.
- Thời điểm: **30/10/2026 01:06:22.659 ICT**; mức `read_failure`; retry đã ghi: `0`.
- Source: [https://www.facebook.com/groups/2112000159035365](https://www.facebook.com/groups/2112000159035365).
- Post: [https://www.facebook.com/2112000159035365_4703423909892964](https://www.facebook.com/2112000159035365_4703423909892964).
- Request route: `—`.
- elapsedMs=2309; wireBytes=110; decodedBytes=144; wireComplete=true.
- Proxy endpoint hash: `840bd17f4157c8e00bb17a0c9abf91aa3a9ca5c8a821253b1fae93d37bf51400` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 200 / 200 | false | 6653 | 7528 | 14330 | 68927 / 311536 | true | — |
| 2 | complete / complete | 200 / None | true | 0 | 1620 | 2309 | 110 / 144 | true | — |

### Case 2

- Job ID: `210da04eacab8f22273c6c7d1f40b3f9490fffa6c7ffb38f7dd7e8273f69cd92`; event ID: `e809f83f-3732-4e5d-9f69-09efd6fc408e`.
- Thời điểm: **30/10/2026 02:05:12.466 ICT**; mức `read_failure`; retry đã ghi: `0`.
- Source: [https://www.facebook.com/groups/213240973487](https://www.facebook.com/groups/213240973487).
- Post: [https://www.facebook.com/213240973487_10166569958978488](https://www.facebook.com/213240973487_10166569958978488).
- Request route: `—`.
- elapsedMs=1406; wireBytes=110; decodedBytes=144; wireComplete=true.
- Proxy endpoint hash: `e49bb3d44b8077d1838aea4f7ae0d3974411f66264b335e4256af14bf034cef0` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 200 / 200 | false | 2728 | 3675 | 10324 | 68617 / 310661 | true | — |
| 2 | complete / complete | 200 / None | true | 0 | 1138 | 1406 | 110 / 144 | true | — |

## G062 — threads-comment / UPSTREAM_HTTP_429

`UPSTREAM_HTTP_429__HTTP_RESPONSE__HTTP_429__COMMENTS`

Group key: `729bee443a25e898480d147057e37b1057afd952aa54e5c08f2bce1fa095d4f0`. Lần đầu 30/10/2026 00:50:28.627; lần cuối 30/10/2026 03:54:53.001.

**Số ghi nhận riêng từng mức:** RQ=23; RT=12; RF=0; JF=0. Tổng bản ghi quan sát=35.

**Quan sát:** Platform request trả HTTP 429; body được chủ động bỏ đọc để nhả tài nguyên nhanh. Đây không phải proxy CONNECT 429.

**Chưa biết/giới hạn:** wireComplete=false ở các case này không chứng minh lỗi truyền body: code cố ý dừng body của 429. Chưa có bằng chứng lỗi giới hạn theo một IP cụ thể.

**Hướng xử lý:** Đối chiếu Retry-After và giới hạn theo platform/operation; xem lại việc xoay proxy lặp liên tục với policy hiện tại. Không quarantine proxy chỉ từ origin HTTP 429.

| Thuộc tính | Giá trị |
|---|---|
| platform | `threads` |
| phase | `http_response` |
| originalReason | `UPSTREAM_HTTP_429` |
| nativeCode | `—` |
| connectStatus | `200` |
| httpStatus | `429` |
| apiCode | `—` |
| operation | `comments` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `false` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `28ae7ea1d807aa281c375b6106450039deb1cb60af337f64d57ba8e1cf331050`; event ID: `3d9cd335-b46d-4653-ab0a-1d4cf53d03af`.
- Thời điểm: **30/10/2026 01:01:34.590 ICT**; mức `request_error`; retry đã ghi: `0`.
- Source: [https://www.threads.com/@chomchom04__](https://www.threads.com/@chomchom04__).
- Post: [https://www.threads.com/@chomchom04__/post/DfChy97Ha1K](https://www.threads.com/@chomchom04__/post/DfChy97Ha1K).
- Request route: `—`.
- elapsedMs=2815; wireBytes=0; decodedBytes=—; wireComplete=false.
- Proxy endpoint hash: `1eb70dfc8882a9198e1c886a51c67c18f567b20bbf8898d43dc6268e72eb9df1` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 2 | complete / complete | 429 / 200 | false | 1907 | 2815 | 2815 | 0 / None | false | — |

### Case 2

- Job ID: `5441487f21351cb9086d91ead92ac10cd217b76782b3338858fd982371810027`; event ID: `81b425f1-8076-4032-bc6c-de686643b58e`.
- Thời điểm: **30/10/2026 03:15:24.344 ICT**; mức `request_error`; retry đã ghi: `0`.
- Source: [https://www.threads.com/@ticketbox.vn](https://www.threads.com/@ticketbox.vn).
- Post: [https://www.threads.com/@ticketbox.vn/post/DfERO1nD0eb](https://www.threads.com/@ticketbox.vn/post/DfERO1nD0eb).
- Request route: `—`.
- elapsedMs=2588; wireBytes=0; decodedBytes=—; wireComplete=false.
- Proxy endpoint hash: `04008c14c6432cfd675d31322da8f6f3a9968c5f7b630ce1212c5f7335a8e408` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 429 / 200 | false | 1954 | 2587 | 2588 | 0 / None | false | — |

## G063 — threads-source / PUBLIC_ITEMS_NOT_RETURNED

`PUBLIC_ITEMS_NOT_RETURNED__HTTP_RESPONSE__HTTP_200__BR__SOURCE`

Group key: `b3ec3597fc32590e5d77d2e1ee3f3ffebe654943e79c471c7021a64d4d7948c4`. Lần đầu 30/10/2026 00:46:55.869; lần cuối 30/10/2026 03:53:36.678.

**Số ghi nhận riêng từng mức:** RQ=0; RT=0; RF=29; JF=0. Tổng bản ghi quan sát=29.

**Quan sát:** Reader không nhận được các item công khai mong đợi tại operation source dù HTTP 200; job kết thúc theo policy.

**Chưa biết/giới hạn:** Có thể là không có dữ liệu trong phạm vi đọc, gate, cấu trúc khác hoặc thiếu item; telemetry hiện tại chưa chứng minh riêng nguyên nhân nào.

**Hướng xử lý:** Đối chiếu native end/empty proof, identity, publication window và container item trong case. Không coi HTTP 200 hay việc job completed là bằng chứng crawl đủ.

| Thuộc tính | Giá trị |
|---|---|
| platform | `threads` |
| phase | `http_response` |
| originalReason | `PUBLIC_ITEMS_NOT_RETURNED` |
| nativeCode | `—` |
| connectStatus | `200` |
| httpStatus | `200` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `br` |
| wireComplete | `true` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `4bf87ab70eb259807586276af7c2f0cdbde060aeac9ce857075a04fb9ef9f82a`; event ID: `8a9260f6-cd15-4255-92f8-f3b70b05c1a9`.
- Thời điểm: **30/10/2026 01:40:24.746 ICT**; mức `read_failure`; retry đã ghi: `19`.
- Source: [https://www.threads.com/@dy.eyes](https://www.threads.com/@dy.eyes).
- Request route: `—`.
- elapsedMs=14752; wireBytes=129296; decodedBytes=705959; wireComplete=true.
- Proxy endpoint hash: `e9c01c03018e9f9c83619045f1de5af5790eefec4217d8439c67130402fe9401` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 200 / 200 | false | 1952 | 2613 | 14752 | 129296 / 705959 | true | — |

### Case 2

- Job ID: `d0f46295f30f128370f728f2bd5a409a3410de1245607559984612a773ae5230`; event ID: `ef980c45-49c2-4f36-a14d-48cb0adb2909`.
- Thời điểm: **30/10/2026 02:09:42.719 ICT**; mức `read_failure`; retry đã ghi: `1`.
- Source: [https://www.threads.com/@vuhuyy4389](https://www.threads.com/@vuhuyy4389).
- Request route: `—`.
- elapsedMs=16764; wireBytes=128818; decodedBytes=705924; wireComplete=true.
- Proxy endpoint hash: `557cf52f500673806ebb8efe0e9ad23be5f2f40f43db5b409bc2042024a85cd7` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 200 / 200 | false | 2217 | 2964 | 16764 | 128818 / 705924 | true | — |

## G064 — threads-source / UPSTREAM_HTTP_429

`UPSTREAM_HTTP_429__HTTP_RESPONSE__HTTP_429__SOURCE`

Group key: `123bcb032f554a70628c93bdd5b6b253e72cab3345a644ac802849c3927742e9`. Lần đầu 30/10/2026 00:48:44.746; lần cuối 30/10/2026 03:54:53.001.

**Số ghi nhận riêng từng mức:** RQ=21; RT=7; RF=0; JF=0. Tổng bản ghi quan sát=28.

**Quan sát:** Platform request trả HTTP 429; body được chủ động bỏ đọc để nhả tài nguyên nhanh. Đây không phải proxy CONNECT 429.

**Chưa biết/giới hạn:** wireComplete=false ở các case này không chứng minh lỗi truyền body: code cố ý dừng body của 429. Chưa có bằng chứng lỗi giới hạn theo một IP cụ thể.

**Hướng xử lý:** Đối chiếu Retry-After và giới hạn theo platform/operation; xem lại việc xoay proxy lặp liên tục với policy hiện tại. Không quarantine proxy chỉ từ origin HTTP 429.

| Thuộc tính | Giá trị |
|---|---|
| platform | `threads` |
| phase | `http_response` |
| originalReason | `UPSTREAM_HTTP_429` |
| nativeCode | `—` |
| connectStatus | `200` |
| httpStatus | `429` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `false` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `4726936f62f31babbf2dac62c989f580f4266dbf76311b2ba95db09a55c563c1`; event ID: `03cb38fe-63c1-4235-bdcd-5f49f24ce5fa`.
- Thời điểm: **30/10/2026 01:44:04.078 ICT**; mức `request_error`; retry đã ghi: `6`.
- Source: [https://www.threads.com/@namdaongoc](https://www.threads.com/@namdaongoc).
- Request route: `—`.
- elapsedMs=2397; wireBytes=0; decodedBytes=—; wireComplete=false.
- Proxy endpoint hash: `eb1e91e5e5edef98237b979af9ae5ad987f02e64ce784cffcb89a3e729609e36` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 2 | complete / complete | 429 / 200 | false | 1658 | 2397 | 2397 | 0 / None | false | — |

### Case 2

- Job ID: `9e9af67078a7a4735dfe15ba017723408b15c5072f7565fad0e722c09384a513`; event ID: `73b5ee1c-cc02-4928-94eb-b15cd4001066`.
- Thời điểm: **30/10/2026 03:54:53.001 ICT**; mức `request_error`; retry đã ghi: `5`.
- Source: [https://www.threads.com/@trinhlemylinh646](https://www.threads.com/@trinhlemylinh646).
- Request route: `—`.
- elapsedMs=3088; wireBytes=0; decodedBytes=—; wireComplete=false.
- Proxy endpoint hash: `7a5bb6859e0af9e636659ef6abd4781c5af02fa367d61c5a79e089561a86ad6a` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 429 / 200 | false | 1944 | 3088 | 3088 | 0 / None | false | — |

## G065 — facebook-page-source / NETWORK_ERROR

`NETWORK_ERROR__RESPONSE_HEADERS__ECONNRESET__SOURCE`

Group key: `964964a09025af0869238375f25218d03001e4af7e7129ab8fdb8011a73eca96`. Lần đầu 30/10/2026 00:47:33.278; lần cuối 30/10/2026 02:46:09.146.

**Số ghi nhận riêng từng mức:** RQ=0; RT=21; RF=0; JF=0. Tổng bản ghi quan sát=21.

**Quan sát:** Socket/TLS đã được cấp (nhiều case là socket tái sử dụng) nhưng bị reset trước khi có HTTP header.

**Chưa biết/giới hạn:** Chưa có HTTP status; không được gán thành lỗi TLS handshake hay lỗi nhận body. Có thể liên quan socket reuse, nhưng mẫu chưa chứng minh nguyên nhân.

**Hướng xử lý:** So sánh reusedSocket=true/false và vòng đời keep-alive cùng route; giữ riêng khỏi TLS và body, không tăng retry mù.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `response_headers` |
| originalReason | `NETWORK_ERROR` |
| nativeCode | `ECONNRESET` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `5a90a1a6d4dab6bd25d814e9307a41eb9117f3cf765e284bb09df4d35513176a`; event ID: `9464043b-9461-4fbf-ae15-9f9c1d53c47d`.
- Thời điểm: **30/10/2026 00:50:12.265 ICT**; mức `read_retry`; retry đã ghi: `2`.
- Source: [https://www.facebook.com/320808488124756](https://www.facebook.com/320808488124756).
- Request route: `https://www.facebook.com/api/graphql/`.
- elapsedMs=217; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `dd03ca107d113c8c98e79730642743635fda075e9b4fc0d97d1344bda54bb466` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 301 / 200 | false | 2988 | 3610 | 28498 | 0 / None | true | — |
| 2 | complete / complete | 200 / None | true | 0 | 898 | 24563 | 198224 / 1139126 | true | — |
| 3 | response_headers / error | None / None | true | 0 | — | 217 | 0 / None | — | ECONNRESET |

### Case 2

- Job ID: `e21711a65abda62189643110e239e06b32025951cda65771592a433e7f32048b`; event ID: `acc46be3-63ff-4414-af9b-e588b402a835`.
- Thời điểm: **30/10/2026 01:03:58.377 ICT**; mức `read_retry`; retry đã ghi: `1`.
- Source: [https://www.facebook.com/430293480332050](https://www.facebook.com/430293480332050).
- Request route: `https://www.facebook.com/api/graphql/`.
- elapsedMs=339; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `a12f5bf8fec29ae1aa8446f8c4fc8025fee2bbc166ae81e00cb146da2531edb7` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 301 / 200 | false | 2161 | 3063 | 28934 | 0 / None | true | — |
| 2 | complete / complete | 200 / None | true | 1 | 749 | 25561 | 208965 / 1211463 | true | — |
| 3 | response_headers / error | None / None | true | 1 | — | 339 | 0 / None | — | ECONNRESET |

## G066 — facebook-page-source / UPSTREAM_NETWORK_ERROR

`UPSTREAM_NETWORK_ERROR__RESPONSE_HEADERS__ECONNRESET__SOURCE`

Group key: `a29320568d007773efc7c1ec523c06d57cf93ea77c38798c4c56080bdac31ca6`. Lần đầu 30/10/2026 00:47:32.638; lần cuối 30/10/2026 02:46:09.013.

**Số ghi nhận riêng từng mức:** RQ=21; RT=0; RF=0; JF=0. Tổng bản ghi quan sát=21.

**Quan sát:** Socket/TLS đã được cấp (nhiều case là socket tái sử dụng) nhưng bị reset trước khi có HTTP header.

**Chưa biết/giới hạn:** Chưa có HTTP status; không được gán thành lỗi TLS handshake hay lỗi nhận body. Có thể liên quan socket reuse, nhưng mẫu chưa chứng minh nguyên nhân.

**Hướng xử lý:** So sánh reusedSocket=true/false và vòng đời keep-alive cùng route; giữ riêng khỏi TLS và body, không tăng retry mù.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `response_headers` |
| originalReason | `UPSTREAM_NETWORK_ERROR` |
| nativeCode | `ECONNRESET` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `22264fa1f79b2371fa65c77aff12e09bc45ee598cc4cb9c65ae550f8771e5c7d`; event ID: `a5fc9690-3768-4bb4-8367-47a29c69801a`.
- Thời điểm: **30/10/2026 01:23:13.595 ICT**; mức `request_error`; retry đã ghi: `4`.
- Source: [https://www.facebook.com/644147032354256](https://www.facebook.com/644147032354256).
- Request route: `https://www.facebook.com/api/graphql/`.
- elapsedMs=402; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `5cb681fe5ea3b2dea979e749d2e004dfe18a2bee66e973e220e95d431b0514df` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 3 | response_headers / error | None / None | true | 1 | — | 402 | 0 / None | — | ECONNRESET |

### Case 2

- Job ID: `c2f412cd9a084e852a37c185d50689787090405119836eab1489ec2a8c6726c0`; event ID: `f7b9d3fc-9462-4262-b3a6-7f8695e32091`.
- Thời điểm: **30/10/2026 01:29:17.937 ICT**; mức `request_error`; retry đã ghi: `0`.
- Source: [https://www.facebook.com/816401518231842](https://www.facebook.com/816401518231842).
- Request route: `https://www.facebook.com/api/graphql/`.
- elapsedMs=838; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `4b519d04a4ee53d85f26400338128bca63f84f6b01481f60f65300cbe8cf3123` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 3 | response_headers / error | None / None | true | 0 | — | 838 | 0 / None | — | ECONNRESET |

## G067 — facebook-page-source / PUBLIC_ITEMS_NOT_RETURNED

`PUBLIC_ITEMS_NOT_RETURNED__HTTP_RESPONSE__HTTP_200__BR__BOOTSTRAP__BOOTSTRAP`

Group key: `27d6517385137f69ed0cf048c81667b90d52362c83d05a072cc859d117b75491`. Lần đầu 30/10/2026 00:59:10.428; lần cuối 30/10/2026 03:45:28.639.

**Số ghi nhận riêng từng mức:** RQ=0; RT=0; RF=20; JF=0. Tổng bản ghi quan sát=20.

**Quan sát:** Reader không nhận được các item công khai mong đợi tại operation bootstrap dù HTTP 200; job kết thúc theo policy.

**Chưa biết/giới hạn:** Có thể là không có dữ liệu trong phạm vi đọc, gate, cấu trúc khác hoặc thiếu item; telemetry hiện tại chưa chứng minh riêng nguyên nhân nào.

**Hướng xử lý:** Đối chiếu native end/empty proof, identity, publication window và container item trong case. Không coi HTTP 200 hay việc job completed là bằng chứng crawl đủ.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `http_response` |
| originalReason | `PUBLIC_ITEMS_NOT_RETURNED` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `200` |
| apiCode | `—` |
| operation | `bootstrap` |
| query | `bootstrap` |
| stage | `—` |
| bodyEncoding | `br` |
| wireComplete | `true` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `5d5e57cb36adb7af4c7aeafe7cb5187354c0ede2c890b0569f5bb94c4c88f213`; event ID: `2da00d48-96d9-4c62-97c1-8b69efea2a0a`.
- Thời điểm: **30/10/2026 00:59:10.428 ICT**; mức `read_failure`; retry đã ghi: `1`.
- Source: [https://www.facebook.com/379790532743490](https://www.facebook.com/379790532743490).
- Request route: `—`.
- elapsedMs=16263; wireBytes=148772; decodedBytes=712717; wireComplete=true.
- Proxy endpoint hash: `42ee874e1acc169f4ce44a74c10bb52659d42b7761bb8049c8ce8ef8e926f544` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 301 / 200 | false | 2860 | 3732 | 20414 | 0 / None | true | — |
| 2 | complete / complete | 200 / None | true | 0 | 1402 | 16263 | 148772 / 712717 | true | — |

### Case 2

- Job ID: `3e5e107b28b0daefc74ed04aae0f1fd5a7c4b09c445db803273afc3c1dd50270`; event ID: `dd4f7b03-5257-4934-9d92-cc2d70f47bac`.
- Thời điểm: **30/10/2026 02:10:14.538 ICT**; mức `read_failure`; retry đã ghi: `0`.
- Source: [https://www.facebook.com/100176336129476](https://www.facebook.com/100176336129476).
- Request route: `—`.
- elapsedMs=14925; wireBytes=143756; decodedBytes=711912; wireComplete=true.
- Proxy endpoint hash: `1eb70dfc8882a9198e1c886a51c67c18f567b20bbf8898d43dc6268e72eb9df1` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 301 / 200 | false | 1446 | 2235 | 17782 | 0 / None | true | — |
| 2 | complete / complete | 200 / None | true | 1 | 773 | 14925 | 143756 / 711912 | true | — |

## G068 — threads-comment / PUBLIC_DATA_NOT_RETURNED

`PUBLIC_DATA_NOT_RETURNED__HTTP_RESPONSE__HTTP_200__BR__COMMENTS`

Group key: `ca2532105dca1cdc0b298de3953dac9081986b3c3f99e7b62fbb627f02806ccf`. Lần đầu 30/10/2026 00:54:06.252; lần cuối 30/10/2026 03:30:46.612.

**Số ghi nhận riêng từng mức:** RQ=0; RT=0; RF=20; JF=0. Tổng bản ghi quan sát=20.

**Quan sát:** Không có dữ liệu comment công khai dùng được trong HTTP 200; policy kết thúc lượt đọc.

**Chưa biết/giới hạn:** Chưa tách được empty hợp lệ, giới hạn anonymous hay parser không thấy node cần lấy.

**Hướng xử lý:** Ghi end/empty proof và native container/error envelope, so parent binding và cursor trong case; giữ trạng thái không xác nhận coverage.

| Thuộc tính | Giá trị |
|---|---|
| platform | `threads` |
| phase | `http_response` |
| originalReason | `PUBLIC_DATA_NOT_RETURNED` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `200` |
| apiCode | `—` |
| operation | `comments` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `br` |
| wireComplete | `true` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `04627196a7d8f2a11f8a8d3ae5d8fd640b6fb7dd83d6dea484190e70f181f3cd`; event ID: `b4977baf-6731-4c02-9cfe-0c8910359e94`.
- Thời điểm: **30/10/2026 01:13:06.219 ICT**; mức `read_failure`; retry đã ghi: `1`.
- Source: [https://www.threads.com/@https.lucing](https://www.threads.com/@https.lucing).
- Post: [https://www.threads.com/@https.lucing/post/DfEeDjCkx1L](https://www.threads.com/@https.lucing/post/DfEeDjCkx1L).
- Request route: `—`.
- elapsedMs=18943; wireBytes=131683; decodedBytes=768465; wireComplete=true.
- Proxy endpoint hash: `04008c14c6432cfd675d31322da8f6f3a9968c5f7b630ce1212c5f7335a8e408` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 302 / 200 | false | 7405 | 8597 | 28106 | 0 / None | true | — |
| 2 | complete / complete | 200 / None | true | 0 | 911 | 18943 | 131683 / 768465 | true | — |

### Case 2

- Job ID: `263a1bc5482bcc900b7e3c1fb4acfe3491f64646d34885f233595a3324b5753c`; event ID: `370ca4a5-0782-4a66-abd4-461095821d97`.
- Thời điểm: **30/10/2026 02:42:50.342 ICT**; mức `read_failure`; retry đã ghi: `0`.
- Source: [https://www.threads.com/@ihnahkstudyy](https://www.threads.com/@ihnahkstudyy).
- Post: [https://www.threads.com/@ihnahkstudyy/post/DfC9D1cgMwY](https://www.threads.com/@ihnahkstudyy/post/DfC9D1cgMwY).
- Request route: `—`.
- elapsedMs=13195; wireBytes=119260; decodedBytes=684521; wireComplete=true.
- Proxy endpoint hash: `cb55289f5b8ad84994086136c79263e50311c9718d73a7c1afd46f69fcfc4916` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 302 / 200 | false | 2359 | 2858 | 17010 | 0 / None | true | — |
| 2 | complete / complete | 200 / None | true | 1 | 730 | 13195 | 119260 / 684521 | true | — |

## G069 — facebook-group-source / PROXY_MANAGER_UNAVAILABLE

`PROXY_MANAGER_UNAVAILABLE__PROXY_ASSIGNMENT__SOURCE`

Group key: `d26a802e4aec5f3e217b4022481ba8a4ccd12e589046fc5b662d854df54ee1c0`. Lần đầu 30/10/2026 00:47:00.054; lần cuối 30/10/2026 03:48:26.447.

**Số ghi nhận riêng từng mức:** RQ=0; RT=20; RF=0; JF=0. Tổng bản ghi quan sát=20.

**Quan sát:** Client không hoàn tất thao tác xin proxy/lease với proxy manager.

**Chưa biết/giới hạn:** Chưa lưu status/cause/endpoint manager cụ thể; không đủ kết luận toàn bộ proxy manager down hay IP upstream lỗi.

**Hướng xử lý:** Ghi riêng manager acquisition/heartbeat/permit/report/release, status và cause gốc. Đối chiếu log manager đúng thời điểm case; không cộng vào reset TLS của platform.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `proxy_assignment` |
| originalReason | `PROXY_MANAGER_UNAVAILABLE` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `—` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `d8bc7048eac4dc88fbb5166a37fb76df40a472ccb211631dbaed0a6c245fbf4a`; event ID: `133aa58b-5b31-49ed-8289-3627ca2d891e`.
- Thời điểm: **30/10/2026 01:59:31.992 ICT**; mức `read_retry`; retry đã ghi: `3`.
- Source: [https://www.facebook.com/groups/2693187864269249](https://www.facebook.com/groups/2693187864269249).
- Request route: `—`.
- elapsedMs=—; wireBytes=—; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `557cf52f500673806ebb8efe0e9ad23be5f2f40f43db5b409bc2042024a85cd7` (không phải địa chỉ/credential proxy).

Không có wire timing trong case này; không suy đoán DNS/TCP/TLS/HTTP stage từ elapsed bị thiếu.

### Case 2

- Job ID: `03549dbcde2676a467e5848585f1850bb8fc98aa5f74549237ad4f6a80932a6f`; event ID: `3caf8255-566d-4c6c-85ef-201d4abbb52d`.
- Thời điểm: **30/10/2026 03:44:55.348 ICT**; mức `read_retry`; retry đã ghi: `1`.
- Source: [https://www.facebook.com/groups/514730749745792](https://www.facebook.com/groups/514730749745792).
- Request route: `—`.
- elapsedMs=—; wireBytes=—; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `9e1c4ce350af423e000416c11bd26ab4624c26ab69ca4e481820f4a03a5019aa` (không phải địa chỉ/credential proxy).

Không có wire timing trong case này; không suy đoán DNS/TCP/TLS/HTTP stage từ elapsed bị thiếu.

## G070 — instagram-source / LOGIN_OR_CHECKPOINT

`LOGIN_OR_CHECKPOINT__HTTP_RESPONSE__HTTP_200__BR__SOURCE`

Group key: `99b1fbe75b9797574a448c44bb138b138d9e03ecdea2175cb0e60dffb7c56003`. Lần đầu 30/10/2026 00:48:18.682; lần cuối 30/10/2026 03:55:00.464.

**Số ghi nhận riêng từng mức:** RQ=0; RT=19; RF=1; JF=0. Tổng bản ghi quan sát=20.

**Quan sát:** Reader Meta nhận diện login/checkpoint trong body HTTP 200; một số case xảy ra sau khi đã nhận dữ liệu công khai.

**Chưa biết/giới hạn:** Không có source_restriction confirmed=true; chưa chứng minh source private hay endpoint bị chặn.

**Hướng xử lý:** Phân biệt login, checkpoint và gate sau dữ liệu bằng tín hiệu native đã khử bí mật. Đối chiếu cùng source/route, không suy ra privacy từ một trang login.

| Thuộc tính | Giá trị |
|---|---|
| platform | `instagram` |
| phase | `http_response` |
| originalReason | `LOGIN_OR_CHECKPOINT` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `200` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `br` |
| wireComplete | `true` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `45cf8cba0ae14bf638c31492ad2fe8ea876a1b801177c15783b7a9f7c20e33f2`; event ID: `a2580661-c6e4-4c47-b0aa-ce9522c59d0f`.
- Thời điểm: **30/10/2026 01:12:06.475 ICT**; mức `read_retry`; retry đã ghi: `1`.
- Source: [https://www.instagram.com/gs25vietnam/](https://www.instagram.com/gs25vietnam/).
- Request route: `—`.
- elapsedMs=14123; wireBytes=93191; decodedBytes=421901; wireComplete=true.
- Proxy endpoint hash: `04008c14c6432cfd675d31322da8f6f3a9968c5f7b630ce1212c5f7335a8e408` (không phải địa chỉ/credential proxy).
- Auth evidence: `{"classification": "unverified", "confirmed": false, "stage": "initial", "evidence": "anonymous_login_or_checkpoint"}`.

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 302 / 200 | false | 2605 | 3490 | 18082 | 0 / None | true | — |
| 2 | complete / complete | 200 / None | true | 0 | 901 | 14123 | 93191 / 421901 | true | — |

### Case 2

- Job ID: `7eb26f407269095b5d0ef2b8901c56bcbcb3284b78459b53d726b83ecbccd231`; event ID: `a4cda8d9-3f35-4068-987f-5bd279420a74`.
- Thời điểm: **30/10/2026 02:16:08.499 ICT**; mức `read_retry`; retry đã ghi: `3`.
- Source: [https://www.instagram.com/coway_vietnam/](https://www.instagram.com/coway_vietnam/).
- Request route: `—`.
- elapsedMs=13718; wireBytes=93281; decodedBytes=425105; wireComplete=true.
- Proxy endpoint hash: `9e1c4ce350af423e000416c11bd26ab4624c26ab69ca4e481820f4a03a5019aa` (không phải địa chỉ/credential proxy).
- Auth evidence: `{"classification": "unverified", "confirmed": false, "stage": "initial", "evidence": "anonymous_login_or_checkpoint"}`.

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 302 / 200 | false | 3187 | 3888 | 18403 | 0 / None | true | — |
| 2 | complete / complete | 200 / None | true | 1 | 822 | 13718 | 93281 / 425105 | true | — |

## G071 — facebook-group-source / PROXY_EXPIRED

`PROXY_EXPIRED__RESPONSE_BODY__PROXY_EXPIRED__HTTP_200__BR__WIRE_COMPLETE__SOURCE`

Group key: `4e6a1ba333256d90626fa22f48b42459243cd7970fec82920de3628aeb9805f6`. Lần đầu 30/10/2026 01:12:10.425; lần cuối 30/10/2026 03:13:57.131.

**Số ghi nhận riêng từng mức:** RQ=9; RT=9; RF=0; JF=0. Tổng bản ghi quan sát=18.

**Quan sát:** Timer hết hạn lease/proxy khi xử lý response body. Trong 24 request_error của nhóm này, HTTP 200 và wireComplete=true: dữ liệu wire đã nhận đủ.

**Chưa biết/giới hạn:** Không phải bằng chứng socket bị reset hay proxy provider từ chối. decodedEndedMs chưa có ở các case kiểm tra; chưa phân biệt được drain/decode chậm hay TTL còn quá ít.

**Hướng xử lý:** Kiểm tra TTL còn lại trước request và ranh giới đóng lease với giải nén xong. Bảo toàn cursor, cân nhắc đổi lease trước khi bắt đầu request gần hết TTL; không gộp với Z_DATA_ERROR hay ECONNRESET.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `response_body` |
| originalReason | `PROXY_EXPIRED` |
| nativeCode | `PROXY_EXPIRED` |
| connectStatus | `—` |
| httpStatus | `200` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `br` |
| wireComplete | `true` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `66e9b69bc947f2945508a552c91f035f2e1c3200852c0eda10a071fe4660f884`; event ID: `c3a7a9d1-f749-489c-8b17-a3cf56568f48`.
- Thời điểm: **30/10/2026 02:47:50.994 ICT**; mức `request_error`; retry đã ghi: `1`.
- Source: [https://www.facebook.com/groups/369426785413368](https://www.facebook.com/groups/369426785413368).
- Request route: `https://www.facebook.com/api/graphql/`.
- elapsedMs=5866; wireBytes=85344; decodedBytes=339516; wireComplete=true.
- Proxy endpoint hash: `dd03ca107d113c8c98e79730642743635fda075e9b4fc0d97d1344bda54bb466` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 6 | response_body / error | 200 / None | true | 1 | 1185 | 5866 | 85344 / 339516 | true | PROXY_EXPIRED |

### Case 2

- Job ID: `4986fb01af62953aa073b36e9b749447fbc7213cd45de5c9a0366384a9082190`; event ID: `fce13390-963e-4bc5-8ac4-8ed6e2a35e10`.
- Thời điểm: **30/10/2026 02:55:09.984 ICT**; mức `request_error`; retry đã ghi: `2`.
- Source: [https://www.facebook.com/groups/378620079234877](https://www.facebook.com/groups/378620079234877).
- Request route: `https://www.facebook.com/api/graphql/`.
- elapsedMs=2381; wireBytes=82174; decodedBytes=212626; wireComplete=true.
- Proxy endpoint hash: `e9c01c03018e9f9c83619045f1de5af5790eefec4217d8439c67130402fe9401` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 6 | response_body / error | 200 / None | true | 0 | 1008 | 2381 | 82174 / 212626 | true | PROXY_EXPIRED |

## G072 — instagram-comment / UPSTREAM_HTTP_429

`UPSTREAM_HTTP_429__HTTP_RESPONSE__HTTP_429__COMMENTS`

Group key: `c2c63e0f760addaa26cae9719f4e4e50c4f687909bc08571545ddd9f1e5840db`. Lần đầu 30/10/2026 01:04:20.017; lần cuối 30/10/2026 03:56:50.363.

**Số ghi nhận riêng từng mức:** RQ=9; RT=9; RF=0; JF=0. Tổng bản ghi quan sát=18.

**Quan sát:** Platform request trả HTTP 429; body được chủ động bỏ đọc để nhả tài nguyên nhanh. Đây không phải proxy CONNECT 429.

**Chưa biết/giới hạn:** wireComplete=false ở các case này không chứng minh lỗi truyền body: code cố ý dừng body của 429. Chưa có bằng chứng lỗi giới hạn theo một IP cụ thể.

**Hướng xử lý:** Đối chiếu Retry-After và giới hạn theo platform/operation; xem lại việc xoay proxy lặp liên tục với policy hiện tại. Không quarantine proxy chỉ từ origin HTTP 429.

| Thuộc tính | Giá trị |
|---|---|
| platform | `instagram` |
| phase | `http_response` |
| originalReason | `UPSTREAM_HTTP_429` |
| nativeCode | `—` |
| connectStatus | `200` |
| httpStatus | `429` |
| apiCode | `—` |
| operation | `comments` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `false` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `8e670333232ef8951768ec8cdf158481590c986eea92bb5fe355dcf8477770e8`; event ID: `fac13dec-1b61-4ab1-86de-c07e9d023149`.
- Thời điểm: **30/10/2026 01:30:36.579 ICT**; mức `request_error`; retry đã ghi: `0`.
- Source: [https://www.instagram.com/misscosmointernational/](https://www.instagram.com/misscosmointernational/).
- Post: [https://www.instagram.com/p/De9OrY7RrmP/](https://www.instagram.com/p/De9OrY7RrmP/).
- Request route: `—`.
- elapsedMs=3634; wireBytes=0; decodedBytes=—; wireComplete=false.
- Proxy endpoint hash: `840bd17f4157c8e00bb17a0c9abf91aa3a9ca5c8a821253b1fae93d37bf51400` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 2 | complete / complete | 429 / 200 | false | 2640 | 3634 | 3634 | 0 / None | false | — |

### Case 2

- Job ID: `7c502b03eb49d550d428050b7d7f06afd5854bf94223eb8440d24050a040222c`; event ID: `699acaad-fac5-4c79-92f1-16ad1620bc76`.
- Thời điểm: **30/10/2026 03:18:16.746 ICT**; mức `request_error`; retry đã ghi: `7`.
- Source: [https://www.instagram.com/dpidamu/](https://www.instagram.com/dpidamu/).
- Post: [https://www.instagram.com/p/DfCstngkpM-/](https://www.instagram.com/p/DfCstngkpM-/).
- Request route: `—`.
- elapsedMs=3662; wireBytes=0; decodedBytes=—; wireComplete=false.
- Proxy endpoint hash: `d315f663ead47476675cf7808b99870727ed7b681348e9e8f1d79de0860408e9` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 2 | complete / complete | 429 / 200 | false | 2971 | 3662 | 3662 | 0 / None | false | — |

## G073 — facebook-page-source / AUTH_REQUIRED

`AUTH_REQUIRED__HTTP_RESPONSE__HTTP_200__BR__BOOTSTRAP__BOOTSTRAP`

Group key: `f69cb3a47f85be4449e65c3452948c139a75f1ba2a390d4bf6ecaa836d01e7d5`. Lần đầu 30/10/2026 02:46:53.191; lần cuối 30/10/2026 02:56:03.472.

**Số ghi nhận riêng từng mức:** RQ=0; RT=14; RF=3; JF=0. Tổng bản ghi quan sát=17.

**Quan sát:** HTTP 200 đã nhận đủ body; reader nhận diện nội dung yêu cầu đăng nhập tại bootstrap. Đây là cổng xác thực ở mức nội dung, không phải HTTP 401 hay reset socket.

**Chưa biết/giới hạn:** Toàn bộ mẫu auth trong cửa sổ có confirmed=false; một số xuất hiện sau khi đã có dữ liệu công khai. Chưa chứng minh source private, proxy bị chặn, hay template chắc chắn sai.

**Hướng xử lý:** Đối chiếu cùng source qua endpoint khác bằng phiên anonymous sạch và giữ dấu hiệu login/route đã khử bí mật. Tách trường hợp ban đầu với sau dữ liệu công khai; không gắn nhãn private chỉ từ login page.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `http_response` |
| originalReason | `AUTH_REQUIRED` |
| nativeCode | `—` |
| connectStatus | `200` |
| httpStatus | `200` |
| apiCode | `—` |
| operation | `bootstrap` |
| query | `bootstrap` |
| stage | `—` |
| bodyEncoding | `br` |
| wireComplete | `true` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `997efd2190c50d3f77e8851b91f5d4c700f04ca1dcf7b606541d3ee8750a6cf1`; event ID: `757ffcde-3790-4c32-8e82-d2221fe4d66c`.
- Thời điểm: **30/10/2026 02:48:00.035 ICT**; mức `read_retry`; retry đã ghi: `2`.
- Source: [https://www.facebook.com/108328122226177](https://www.facebook.com/108328122226177).
- Request route: `—`.
- elapsedMs=29226; wireBytes=75650; decodedBytes=364592; wireComplete=true.
- Proxy endpoint hash: `2becb4985e92d60fe4ef9e97d04f2f9c303e486e180844eaab3f716aae6f9533` (không phải địa chỉ/credential proxy).
- Auth evidence: `{"classification": "unverified", "confirmed": false, "stage": "initial", "evidence": "anonymous_login_or_checkpoint"}`.

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 302 / 200 | false | 1920 | 3315 | 34728 | 0 / None | true | — |
| 2 | complete / complete | 302 / None | true | 1 | 1085 | 30749 | 0 / None | true | — |
| 3 | complete / complete | 200 / 200 | false | 18395 | 19130 | 29226 | 75650 / 364592 | true | — |

### Case 2

- Job ID: `c742e5208b3e26ada26537442d50952d6a8ddf0cfb551a22cf5bc6e7cb7c747d`; event ID: `9a68ef53-4990-4052-8f79-4d7ad5011f63`.
- Thời điểm: **30/10/2026 02:55:16.049 ICT**; mức `read_failure`; retry đã ghi: `3`.
- Source: [https://www.facebook.com/110462657900365](https://www.facebook.com/110462657900365).
- Request route: `—`.
- elapsedMs=9942; wireBytes=75505; decodedBytes=364410; wireComplete=true.
- Proxy endpoint hash: `bf465100ec7fc0556b182ff0c9d3a95a488a290c56a2546f2ae66ce11182238c` (không phải địa chỉ/credential proxy).
- Auth evidence: `{"classification": "unverified", "confirmed": false, "stage": "initial", "evidence": "anonymous_login_or_checkpoint"}`.

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 302 / 200 | false | 1719 | 2620 | 13085 | 0 / None | true | — |
| 2 | complete / complete | 200 / 200 | false | 1749 | 2347 | 9942 | 75505 / 364410 | true | — |

## G074 — facebook-user-source / UPSTREAM_TIMEOUT

`UPSTREAM_TIMEOUT__UNOBSERVED__SOURCE`

Group key: `f566bba475529619c8e019e47da54945abbe81dcc3b4ba8cfdbb37a91a6fb6b7`. Lần đầu 30/10/2026 00:50:11.780; lần cuối 30/10/2026 03:42:41.507.

**Số ghi nhận riêng từng mức:** RQ=0; RT=14; RF=0; JF=0. Tổng bản ghi quan sát=14.

**Quan sát:** Hết thời gian của lượt đọc, nhưng không có networkTimings để định vị đến DNS/CONNECT/TLS/header/body.

**Chưa biết/giới hạn:** UPSTREAM_TIMEOUT là mã tổng hợp của ứng dụng; không phải bằng chứng native ETIMEDOUT. Không có elapsedMs ở các case này.

**Hướng xử lý:** Bổ sung trace trước acquisition/permit/request và giữ timing khi dispose/timeout. Giữ nhóm UNOBSERVED riêng; dùng job ID/cursor của case để tái hiện, không gán nguyên nhân cho proxy.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `unobserved` |
| originalReason | `UPSTREAM_TIMEOUT` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `—` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `317f6f6465d8cda11e2e758c1d6916a4ee52d4f310f2153990b5bc152063d4e6`; event ID: `e898f349-72db-4f2c-81e4-56592342436e`.
- Thời điểm: **30/10/2026 01:41:10.420 ICT**; mức `read_retry`; retry đã ghi: `2`.
- Source: [https://www.facebook.com/100010615633031](https://www.facebook.com/100010615633031).
- Request route: `—`.
- elapsedMs=—; wireBytes=—; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `263a0fde12b0228de5c2ea4cc471ca2bf53d0da3f0a9bbbf3a98334add20ef69` (không phải địa chỉ/credential proxy).

Không có wire timing trong case này; không suy đoán DNS/TCP/TLS/HTTP stage từ elapsed bị thiếu.

### Case 2

- Job ID: `03ac8c29acfec870fde1e91ef1c76b1164fa5af271d070e6fe4e45beb5904569`; event ID: `5fc7f92c-8f41-4fbd-b92e-eff2071d7c90`.
- Thời điểm: **30/10/2026 01:53:53.339 ICT**; mức `read_retry`; retry đã ghi: `1`.
- Source: [https://www.facebook.com/100019290253931](https://www.facebook.com/100019290253931).
- Request route: `—`.
- elapsedMs=—; wireBytes=—; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `04008c14c6432cfd675d31322da8f6f3a9968c5f7b630ce1212c5f7335a8e408` (không phải địa chỉ/credential proxy).

Không có wire timing trong case này; không suy đoán DNS/TCP/TLS/HTTP stage từ elapsed bị thiếu.

## G075 — threads-source / HTTP_429

`HTTP_429__HTTP_RESPONSE__HTTP_429__SOURCE`

Group key: `38fccd510f6b8215caa4ed57c8bc03a102643cf7c9374c68fbf1d54ee70c9601`. Lần đầu 30/10/2026 00:48:44.966; lần cuối 30/10/2026 03:54:53.716.

**Số ghi nhận riêng từng mức:** RQ=0; RT=14; RF=0; JF=0. Tổng bản ghi quan sát=14.

**Quan sát:** Platform request trả HTTP 429; body được chủ động bỏ đọc để nhả tài nguyên nhanh. Đây không phải proxy CONNECT 429.

**Chưa biết/giới hạn:** wireComplete=false ở các case này không chứng minh lỗi truyền body: code cố ý dừng body của 429. Chưa có bằng chứng lỗi giới hạn theo một IP cụ thể.

**Hướng xử lý:** Đối chiếu Retry-After và giới hạn theo platform/operation; xem lại việc xoay proxy lặp liên tục với policy hiện tại. Không quarantine proxy chỉ từ origin HTTP 429.

| Thuộc tính | Giá trị |
|---|---|
| platform | `threads` |
| phase | `http_response` |
| originalReason | `HTTP_429` |
| nativeCode | `—` |
| connectStatus | `200` |
| httpStatus | `429` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `false` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `9e478dc53cc483d1ab50e45d588570b52f0d487b8144687f24430b6f7288e1a9`; event ID: `69699445-ff3c-4fe7-b259-f63199a0902b`.
- Thời điểm: **30/10/2026 02:00:27.140 ICT**; mức `read_retry`; retry đã ghi: `1`.
- Source: [https://www.threads.com/@mmmaymay._](https://www.threads.com/@mmmaymay._).
- Request route: `—`.
- elapsedMs=2670; wireBytes=0; decodedBytes=—; wireComplete=false.
- Proxy endpoint hash: `6435ac2d8b512f971652983ba5bdded2f76be7ba79bdecea77c799dd8f0b900c` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 429 / 200 | false | 2142 | 2670 | 2670 | 0 / None | false | — |

### Case 2

- Job ID: `9e9af67078a7a4735dfe15ba017723408b15c5072f7565fad0e722c09384a513`; event ID: `f0c1b133-9bcd-4225-a65d-0b30fb8511d5`.
- Thời điểm: **30/10/2026 03:54:53.716 ICT**; mức `read_retry`; retry đã ghi: `6`.
- Source: [https://www.threads.com/@trinhlemylinh646](https://www.threads.com/@trinhlemylinh646).
- Request route: `—`.
- elapsedMs=3088; wireBytes=0; decodedBytes=—; wireComplete=false.
- Proxy endpoint hash: `7a5bb6859e0af9e636659ef6abd4781c5af02fa367d61c5a79e089561a86ad6a` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 429 / 200 | false | 1944 | 3088 | 3088 | 0 / None | false | — |

## G076 — facebook-page-source / PROXY_EXPIRED

`PROXY_EXPIRED__RESPONSE_BODY__PROXY_EXPIRED__HTTP_200__BR__WIRE_COMPLETE__SOURCE`

Group key: `bf7c56c060901c884bffe54882edbe8c9f2b9851cb1c9f9df145c05329fa4583`. Lần đầu 30/10/2026 01:34:20.793; lần cuối 30/10/2026 03:55:03.783.

**Số ghi nhận riêng từng mức:** RQ=6; RT=6; RF=0; JF=0. Tổng bản ghi quan sát=12.

**Quan sát:** Timer hết hạn lease/proxy khi xử lý response body. Trong 24 request_error của nhóm này, HTTP 200 và wireComplete=true: dữ liệu wire đã nhận đủ.

**Chưa biết/giới hạn:** Không phải bằng chứng socket bị reset hay proxy provider từ chối. decodedEndedMs chưa có ở các case kiểm tra; chưa phân biệt được drain/decode chậm hay TTL còn quá ít.

**Hướng xử lý:** Kiểm tra TTL còn lại trước request và ranh giới đóng lease với giải nén xong. Bảo toàn cursor, cân nhắc đổi lease trước khi bắt đầu request gần hết TTL; không gộp với Z_DATA_ERROR hay ECONNRESET.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `response_body` |
| originalReason | `PROXY_EXPIRED` |
| nativeCode | `PROXY_EXPIRED` |
| connectStatus | `—` |
| httpStatus | `200` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `br` |
| wireComplete | `true` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `913dbf2cfb153a768317e34ea548f982f42cddb24c171c20556b07daf74be312`; event ID: `9ae1d714-fd0b-4378-a785-12a0f9c2703a`.
- Thời điểm: **30/10/2026 01:34:20.793 ICT**; mức `request_error`; retry đã ghi: `12`.
- Source: [https://www.facebook.com/499177406920955](https://www.facebook.com/499177406920955).
- Request route: `https://www.facebook.com/api/graphql/`.
- elapsedMs=2210; wireBytes=73778; decodedBytes=206642; wireComplete=true.
- Proxy endpoint hash: `eb1e91e5e5edef98237b979af9ae5ad987f02e64ce784cffcb89a3e729609e36` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 10 | response_body / error | 200 / None | true | 1 | 1058 | 2210 | 73778 / 206642 | true | PROXY_EXPIRED |

### Case 2

- Job ID: `dc353f8e99bd34b56771c2e0e3f05c855d0a0d70e37ef3a8eea2fc46adfa6042`; event ID: `731d660d-4522-42ba-a6fc-addb2af1b72e`.
- Thời điểm: **30/10/2026 02:40:47.504 ICT**; mức `request_error`; retry đã ghi: `2`.
- Source: [https://www.facebook.com/105685441657318](https://www.facebook.com/105685441657318).
- Request route: `https://www.facebook.com/api/graphql/`.
- elapsedMs=8851; wireBytes=114124; decodedBytes=484902; wireComplete=true.
- Proxy endpoint hash: `dda391ca5d52fff0621a1dac7434f1b6d70181bea38ddccb5008c9180d06d472` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 6 | response_body / error | 200 / None | true | 1 | 1613 | 8851 | 114124 / 484902 | true | PROXY_EXPIRED |

## G077 — instagram-source / PROXY_EXPIRED

`PROXY_EXPIRED__RESPONSE_BODY__PROXY_EXPIRED__HTTP_200__BR__WIRE_COMPLETE__SOURCE`

Group key: `b23d186fe859011486f77a84a137c9193cf2573674dc981395aa0dfdbc8ea3d9`. Lần đầu 30/10/2026 00:48:30.971; lần cuối 30/10/2026 03:01:57.135.

**Số ghi nhận riêng từng mức:** RQ=6; RT=6; RF=0; JF=0. Tổng bản ghi quan sát=12.

**Quan sát:** Timer hết hạn lease/proxy khi xử lý response body. Trong 24 request_error của nhóm này, HTTP 200 và wireComplete=true: dữ liệu wire đã nhận đủ.

**Chưa biết/giới hạn:** Không phải bằng chứng socket bị reset hay proxy provider từ chối. decodedEndedMs chưa có ở các case kiểm tra; chưa phân biệt được drain/decode chậm hay TTL còn quá ít.

**Hướng xử lý:** Kiểm tra TTL còn lại trước request và ranh giới đóng lease với giải nén xong. Bảo toàn cursor, cân nhắc đổi lease trước khi bắt đầu request gần hết TTL; không gộp với Z_DATA_ERROR hay ECONNRESET.

| Thuộc tính | Giá trị |
|---|---|
| platform | `instagram` |
| phase | `response_body` |
| originalReason | `PROXY_EXPIRED` |
| nativeCode | `PROXY_EXPIRED` |
| connectStatus | `—` |
| httpStatus | `200` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `br` |
| wireComplete | `true` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `faba8b7f720450160fa14b156a3167a4bc5addb4a743f95d90e8f79d07f89d57`; event ID: `326246a6-a6fb-47d8-b0ef-27cc94bcd0e0`.
- Thời điểm: **30/10/2026 01:34:20.792 ICT**; mức `request_error`; retry đã ghi: `0`.
- Source: [https://www.instagram.com/dienmayxanhcom/](https://www.instagram.com/dienmayxanhcom/).
- Request route: `https://www.instagram.com/reel/DdjOFx4jxz3/`.
- elapsedMs=2200; wireBytes=71876; decodedBytes=107090; wireComplete=true.
- Proxy endpoint hash: `eb1e91e5e5edef98237b979af9ae5ad987f02e64ce784cffcb89a3e729609e36` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 5 | response_body / error | 200 / None | true | 0 | 745 | 2200 | 71876 / 107090 | true | PROXY_EXPIRED |

### Case 2

- Job ID: `bef78b3fcc774f909ba6532934ffaa544d00046d7f880465e313d9f4f9601e70`; event ID: `6699bca2-feff-4cfd-8f72-f2ffa6196230`.
- Thời điểm: **30/10/2026 03:01:56.952 ICT**; mức `request_error`; retry đã ghi: `3`.
- Source: [https://www.instagram.com/cgvcinemasvietnam/](https://www.instagram.com/cgvcinemasvietnam/).
- Request route: `https://www.instagram.com/p/De_wOgdjQ3O/`.
- elapsedMs=7107; wireBytes=105901; decodedBytes=424799; wireComplete=true.
- Proxy endpoint hash: `2becb4985e92d60fe4ef9e97d04f2f9c303e486e180844eaab3f716aae6f9533` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 10 | response_body / error | 200 / None | true | 0 | 1072 | 7107 | 105901 / 424799 | true | PROXY_EXPIRED |

## G078 — threads-source / UPSTREAM_API_ERROR

`UPSTREAM_API_ERROR__HTTP_RESPONSE__HTTP_200__BR__SOURCE`

Group key: `344259f2caeb402a48ae02898bafd7373ef7e9a155cb546def23a2f22c8b6c22`. Lần đầu 30/10/2026 01:09:09.786; lần cuối 30/10/2026 03:59:56.072.

**Số ghi nhận riêng từng mức:** RQ=0; RT=0; RF=11; JF=0. Tổng bản ghi quan sát=11.

**Quan sát:** Reader báo lỗi với chữ ký đã ghi trong bảng dưới.

**Chưa biết/giới hạn:** Bằng chứng chưa đủ để kết luận nguyên nhân sâu hơn.

**Hướng xử lý:** Đối chiếu metadata và native response của 1–2 case; bổ sung trường còn thiếu trước khi sửa policy.

| Thuộc tính | Giá trị |
|---|---|
| platform | `threads` |
| phase | `http_response` |
| originalReason | `UPSTREAM_API_ERROR` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `200` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `br` |
| wireComplete | `true` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `9d16a2034b48b2aa3cb5c3126c732abd618a85951f3263ad358c583723fcfaf0`; event ID: `46b3572d-c309-4eff-bd75-20d3659cb82f`.
- Thời điểm: **30/10/2026 01:22:30.029 ICT**; mức `read_failure`; retry đã ghi: `2`.
- Source: [https://www.threads.com/@hunggiang2039](https://www.threads.com/@hunggiang2039).
- Request route: `—`.
- elapsedMs=2660; wireBytes=11926; decodedBytes=103241; wireComplete=true.
- Proxy endpoint hash: `5cb681fe5ea3b2dea979e749d2e004dfe18a2bee66e973e220e95d431b0514df` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 3 | complete / complete | 200 / None | true | 1 | 1468 | 2660 | 11926 / 103241 | true | — |

### Case 2

- Job ID: `96830ba82e0ad529bcf378b7f7410dcec45705aaa6976430780b7a1b2f043d4b`; event ID: `0c7c726f-a6ee-4836-84f7-56572329311f`.
- Thời điểm: **30/10/2026 02:44:41.382 ICT**; mức `read_failure`; retry đã ghi: `0`.
- Source: [https://www.threads.com/@buiminh.lan.520](https://www.threads.com/@buiminh.lan.520).
- Request route: `—`.
- elapsedMs=3337; wireBytes=10436; decodedBytes=101810; wireComplete=true.
- Proxy endpoint hash: `1eb70dfc8882a9198e1c886a51c67c18f567b20bbf8898d43dc6268e72eb9df1` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 3 | complete / complete | 200 / None | true | 1 | 1152 | 3337 | 10436 / 101810 | true | — |

## G079 — facebook-reply / NETWORK_ERROR

`NETWORK_ERROR__RESPONSE_HEADERS__ECONNRESET__REPLIES__DEPTH1COMMENTSLISTPAGINATIONQUERY`

Group key: `94d0a5e5efc6569b7df67585de8a18f43819baa563e9166e7aa422b9347b3be0`. Lần đầu 30/10/2026 00:47:31.917; lần cuối 30/10/2026 03:46:00.609.

**Số ghi nhận riêng từng mức:** RQ=0; RT=11; RF=0; JF=0. Tổng bản ghi quan sát=11.

**Quan sát:** Socket/TLS đã được cấp (nhiều case là socket tái sử dụng) nhưng bị reset trước khi có HTTP header.

**Chưa biết/giới hạn:** Chưa có HTTP status; không được gán thành lỗi TLS handshake hay lỗi nhận body. Có thể liên quan socket reuse, nhưng mẫu chưa chứng minh nguyên nhân.

**Hướng xử lý:** So sánh reusedSocket=true/false và vòng đời keep-alive cùng route; giữ riêng khỏi TLS và body, không tăng retry mù.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `response_headers` |
| originalReason | `NETWORK_ERROR` |
| nativeCode | `ECONNRESET` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `replies` |
| query | `Depth1CommentsListPaginationQuery` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `f74e12be7f3e83c710d8155f1ff12fbf4e41880e72a967e331b77381c6606a76`; event ID: `a8a9a75c-d841-4c0f-8d84-a0cc92167d9c`.
- Thời điểm: **30/10/2026 00:56:17.051 ICT**; mức `read_retry`; retry đã ghi: `2`.
- Source: [https://www.facebook.com/groups/170667840008977](https://www.facebook.com/groups/170667840008977).
- Post: [https://www.facebook.com/170667840008977_2868651930210541](https://www.facebook.com/170667840008977_2868651930210541).
- Request route: `https://www.facebook.com/api/graphql/`.
- elapsedMs=800; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `8be8925c255ad041f858b4befba9866feaec30edaa6248b56910436f3a0815f8` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 301 / 200 | false | 2440 | 3485 | 30195 | 0 / None | true | — |
| 2 | complete / complete | 200 / None | true | 1 | 1104 | 26113 | 165788 / 1402276 | true | — |
| 3 | response_headers / error | None / None | true | 1 | — | 800 | 0 / None | — | ECONNRESET |

### Case 2

- Job ID: `8b641874236170cb8bdb643bf9559ad0cecb43728e978fa2353ae0ccdaeb366e`; event ID: `567ca8d8-df96-4190-915f-20128626ca75`.
- Thời điểm: **30/10/2026 02:32:15.861 ICT**; mức `read_retry`; retry đã ghi: `9`.
- Source: [https://www.facebook.com/groups/1052037723261409](https://www.facebook.com/groups/1052037723261409).
- Post: [https://www.facebook.com/1052037723261409_1752755913189583](https://www.facebook.com/1052037723261409_1752755913189583).
- Request route: `https://www.facebook.com/api/graphql/`.
- elapsedMs=565; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `affaf876df2d020091c10b062f561aae049fbed6c8785dde7a22374eab9bcdf7` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 301 / 200 | false | 1563 | 2229 | 18936 | 0 / None | true | — |
| 2 | complete / complete | 200 / None | true | 0 | 1572 | 16377 | 136301 / 863811 | true | — |
| 3 | response_headers / error | None / None | true | 0 | — | 565 | 0 / None | — | ECONNRESET |

## G080 — youtube-comment / PROXY_EXPIRED

`PROXY_EXPIRED__PROXY_HEARTBEAT__PROXY_EXPIRED__COMMENTS`

Group key: `041e03c3ea2a53cad386e5794bf95ffa8e582d371dbe7c0e5d1ecb26186a9ed1`. Lần đầu 30/10/2026 00:48:30.966; lần cuối 30/10/2026 03:43:09.297.

**Số ghi nhận riêng từng mức:** RQ=0; RT=11; RF=0; JF=0. Tổng bản ghi quan sát=11.

**Quan sát:** Lease đã hết hạn khi kiểm tra heartbeat trước khi tiếp tục đọc; đây là vòng đời lease, không phải lỗi HTTP response.

**Chưa biết/giới hạn:** Không có bằng chứng target platform lỗi; thời điểm hết hạn không đo được từ body do chưa có request mới.

**Hướng xử lý:** Đối chiếu expiresAt/heartbeat và thay lease theo policy giữ cursor. Phân loại như sự kiện vòng đời cần theo dõi, tách khỏi sự cố mạng.

| Thuộc tính | Giá trị |
|---|---|
| platform | `youtube` |
| phase | `proxy_heartbeat` |
| originalReason | `PROXY_EXPIRED` |
| nativeCode | `PROXY_EXPIRED` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `comments` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `—` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `58dcea19562142eef768d5a55ae579502eaeef24d7d093d2d5dd2b1049aed0a2`; event ID: `c1fa59f8-8aa1-41d1-87c1-c98982687db8`.
- Thời điểm: **30/10/2026 01:39:58.488 ICT**; mức `read_retry`; retry đã ghi: `1`.
- Source: [https://www.youtube.com/channel/UC22CLKuH7yPi4TPcUkQPHOw](https://www.youtube.com/channel/UC22CLKuH7yPi4TPcUkQPHOw).
- Post: [https://www.youtube.com/watch?v=nkBVNRY6bu8](https://www.youtube.com/watch?v=nkBVNRY6bu8).
- Request route: `—`.
- elapsedMs=—; wireBytes=—; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `b8e31946f60323d860e53d5c3556ae3d5dc55f8088a58e362d4008a54a8dbc90` (không phải địa chỉ/credential proxy).

Không có wire timing trong case này; không suy đoán DNS/TCP/TLS/HTTP stage từ elapsed bị thiếu.

### Case 2

- Job ID: `b9db2d4d5bfc9073c8317b18ac44f892a64e723a622de97d71fc907a633e3fc2`; event ID: `992bbbff-7a3f-4751-9b56-4c28b30685b4`.
- Thời điểm: **30/10/2026 01:49:41.663 ICT**; mức `read_retry`; retry đã ghi: `2`.
- Source: [https://www.youtube.com/channel/UCQ0jSGgYMLmRMeTE6UaPPXg](https://www.youtube.com/channel/UCQ0jSGgYMLmRMeTE6UaPPXg).
- Post: [https://www.youtube.com/watch?v=lfax9vaAdJ4](https://www.youtube.com/watch?v=lfax9vaAdJ4).
- Request route: `—`.
- elapsedMs=—; wireBytes=—; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `f0154747fd463a4eaa4d1cb4e5d512b2e68a2b89e62fc66699afb69b8ea8864d` (không phải địa chỉ/credential proxy).

Không có wire timing trong case này; không suy đoán DNS/TCP/TLS/HTTP stage từ elapsed bị thiếu.

## G081 — threads-comment / HTTP_429

`HTTP_429__HTTP_RESPONSE__HTTP_429__COMMENTS`

Group key: `22ee3c6f069cadce872f4d168d011d61511110286fa952c3a344edf3c8671be2`. Lần đầu 30/10/2026 01:30:52.747; lần cuối 30/10/2026 03:54:53.715.

**Số ghi nhận riêng từng mức:** RQ=0; RT=11; RF=0; JF=0. Tổng bản ghi quan sát=11.

**Quan sát:** Platform request trả HTTP 429; body được chủ động bỏ đọc để nhả tài nguyên nhanh. Đây không phải proxy CONNECT 429.

**Chưa biết/giới hạn:** wireComplete=false ở các case này không chứng minh lỗi truyền body: code cố ý dừng body của 429. Chưa có bằng chứng lỗi giới hạn theo một IP cụ thể.

**Hướng xử lý:** Đối chiếu Retry-After và giới hạn theo platform/operation; xem lại việc xoay proxy lặp liên tục với policy hiện tại. Không quarantine proxy chỉ từ origin HTTP 429.

| Thuộc tính | Giá trị |
|---|---|
| platform | `threads` |
| phase | `http_response` |
| originalReason | `HTTP_429` |
| nativeCode | `—` |
| connectStatus | `200` |
| httpStatus | `429` |
| apiCode | `—` |
| operation | `comments` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `false` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `3758047c83b8cb05618e4950a28e6316be36997ca639caf22f02388939ee5b22`; event ID: `c93c7a8b-83aa-4134-b6d5-b54509a5b863`.
- Thời điểm: **30/10/2026 01:30:52.747 ICT**; mức `read_retry`; retry đã ghi: `3`.
- Source: [https://www.threads.com/@tuilanancy](https://www.threads.com/@tuilanancy).
- Post: [https://www.threads.com/@tuilanancy/post/DfCq50OGTAU](https://www.threads.com/@tuilanancy/post/DfCq50OGTAU).
- Request route: `—`.
- elapsedMs=3212; wireBytes=0; decodedBytes=—; wireComplete=false.
- Proxy endpoint hash: `e9c01c03018e9f9c83619045f1de5af5790eefec4217d8439c67130402fe9401` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 429 / 200 | false | 2406 | 3211 | 3212 | 0 / None | false | — |

### Case 2

- Job ID: `75a18db2c8305d2d91005e4e997bcd49946653d090c5608f6a8aa8e83a0ec178`; event ID: `77509569-4a91-4edd-a43e-7e44face264c`.
- Thời điểm: **30/10/2026 02:45:20.256 ICT**; mức `read_retry`; retry đã ghi: `3`.
- Source: [https://www.threads.com/@bully_idol_vietnam/](https://www.threads.com/@bully_idol_vietnam/).
- Post: [https://www.threads.com/@bully_idol_vietnam/post/DfFDirNGhrU](https://www.threads.com/@bully_idol_vietnam/post/DfFDirNGhrU).
- Request route: `—`.
- elapsedMs=4329; wireBytes=0; decodedBytes=—; wireComplete=false.
- Proxy endpoint hash: `3e473a7f05269e6b6350a75fb3dc72787cee0c8235a4f84a8790ba61609177b6` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 429 / 200 | false | 2547 | 4329 | 4329 | 0 / None | false | — |

## G082 — facebook-reply / UPSTREAM_NETWORK_ERROR

`UPSTREAM_NETWORK_ERROR__RESPONSE_HEADERS__ECONNRESET__REPLIES__DEPTH1COMMENTSLISTPAGINATIONQUERY`

Group key: `22bfd1eef4b636958e98c5150afe6bca0a9d9545de394d8d48e6406a6a06c20f`. Lần đầu 30/10/2026 00:47:31.861; lần cuối 30/10/2026 03:46:00.510.

**Số ghi nhận riêng từng mức:** RQ=11; RT=0; RF=0; JF=0. Tổng bản ghi quan sát=11.

**Quan sát:** Socket/TLS đã được cấp (nhiều case là socket tái sử dụng) nhưng bị reset trước khi có HTTP header.

**Chưa biết/giới hạn:** Chưa có HTTP status; không được gán thành lỗi TLS handshake hay lỗi nhận body. Có thể liên quan socket reuse, nhưng mẫu chưa chứng minh nguyên nhân.

**Hướng xử lý:** So sánh reusedSocket=true/false và vòng đời keep-alive cùng route; giữ riêng khỏi TLS và body, không tăng retry mù.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `response_headers` |
| originalReason | `UPSTREAM_NETWORK_ERROR` |
| nativeCode | `ECONNRESET` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `replies` |
| query | `Depth1CommentsListPaginationQuery` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `f74e12be7f3e83c710d8155f1ff12fbf4e41880e72a967e331b77381c6606a76`; event ID: `cc26821f-ffc9-48cf-b456-58472f14704a`.
- Thời điểm: **30/10/2026 00:56:16.640 ICT**; mức `request_error`; retry đã ghi: `1`.
- Source: [https://www.facebook.com/groups/170667840008977](https://www.facebook.com/groups/170667840008977).
- Post: [https://www.facebook.com/170667840008977_2868651930210541](https://www.facebook.com/170667840008977_2868651930210541).
- Request route: `https://www.facebook.com/api/graphql/`.
- elapsedMs=800; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `8be8925c255ad041f858b4befba9866feaec30edaa6248b56910436f3a0815f8` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 3 | response_headers / error | None / None | true | 1 | — | 800 | 0 / None | — | ECONNRESET |

### Case 2

- Job ID: `abba4850dc9d0f7f9b2402b621738fa2838629803bd115af9ff0898b826578ae`; event ID: `7e26fd9b-f04c-425f-aec0-ee844d63e29d`.
- Thời điểm: **30/10/2026 03:46:00.510 ICT**; mức `request_error`; retry đã ghi: `0`.
- Source: [https://www.facebook.com/groups/1458273184430485](https://www.facebook.com/groups/1458273184430485).
- Post: [https://www.facebook.com/1458273184430485_4554457238145382](https://www.facebook.com/1458273184430485_4554457238145382).
- Request route: `https://www.facebook.com/api/graphql/`.
- elapsedMs=620; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `4b519d04a4ee53d85f26400338128bca63f84f6b01481f60f65300cbe8cf3123` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 3 | response_headers / error | None / None | true | 1 | — | 620 | 0 / None | — | ECONNRESET |

## G083 — instagram-comment / UPSTREAM_NETWORK_ERROR

`UPSTREAM_NETWORK_ERROR__RESPONSE_HEADERS__ECONNRESET__COMMENTS`

Group key: `513b9f51671111637cf4a0ee8fca4983e0dd3beff4f4ddacfb51fb459f4ed172`. Lần đầu 30/10/2026 00:55:37.615; lần cuối 30/10/2026 03:04:46.206.

**Số ghi nhận riêng từng mức:** RQ=5; RT=5; RF=0; JF=0. Tổng bản ghi quan sát=10.

**Quan sát:** Socket/TLS đã được cấp (nhiều case là socket tái sử dụng) nhưng bị reset trước khi có HTTP header.

**Chưa biết/giới hạn:** Chưa có HTTP status; không được gán thành lỗi TLS handshake hay lỗi nhận body. Có thể liên quan socket reuse, nhưng mẫu chưa chứng minh nguyên nhân.

**Hướng xử lý:** So sánh reusedSocket=true/false và vòng đời keep-alive cùng route; giữ riêng khỏi TLS và body, không tăng retry mù.

| Thuộc tính | Giá trị |
|---|---|
| platform | `instagram` |
| phase | `response_headers` |
| originalReason | `UPSTREAM_NETWORK_ERROR` |
| nativeCode | `ECONNRESET` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `comments` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `2c3f312b1fac7f6bea954a8b8e3e2d1d97fc79d50014fbc31c1720bb19f2b757`; event ID: `3f331559-3811-4ee0-b2e9-efbe7b23c5e7`.
- Thời điểm: **30/10/2026 00:55:37.615 ICT**; mức `request_error`; retry đã ghi: `1`.
- Source: [https://www.instagram.com/dpidamu/](https://www.instagram.com/dpidamu/).
- Post: [https://www.instagram.com/reel/DfCSmhASggd/](https://www.instagram.com/reel/DfCSmhASggd/).
- Request route: `https://www.instagram.com/api/graphql`.
- elapsedMs=591; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `4b519d04a4ee53d85f26400338128bca63f84f6b01481f60f65300cbe8cf3123` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 3 | response_headers / error | None / None | true | 1 | — | 591 | 0 / None | — | ECONNRESET |

### Case 2

- Job ID: `340c9232796b458d5e850f934210ebf97f4405ac26c44185f79bf480e62bb422`; event ID: `f765534d-e523-4050-a235-38957259cf53`.
- Thời điểm: **30/10/2026 03:04:45.943 ICT**; mức `request_error`; retry đã ghi: `18`.
- Source: [https://www.instagram.com/dpidamu/](https://www.instagram.com/dpidamu/).
- Post: [https://www.instagram.com/p/DfB72D0ks_0/](https://www.instagram.com/p/DfB72D0ks_0/).
- Request route: `https://www.instagram.com/api/graphql`.
- elapsedMs=319; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `42ee874e1acc169f4ce44a74c10bb52659d42b7761bb8049c8ce8ef8e926f544` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 2 | response_headers / error | None / None | true | 0 | — | 319 | 0 / None | — | ECONNRESET |

## G084 — facebook-group-source / PROXY_EXPIRED

`PROXY_EXPIRED__PROXY_HEARTBEAT__PROXY_EXPIRED__SOURCE`

Group key: `e1eeefd149a43c8917cfe8514a446a4982061c4e7f6e1a566ecb68e86038f87e`. Lần đầu 30/10/2026 00:52:05.037; lần cuối 30/10/2026 03:42:51.923.

**Số ghi nhận riêng từng mức:** RQ=0; RT=10; RF=0; JF=0. Tổng bản ghi quan sát=10.

**Quan sát:** Lease đã hết hạn khi kiểm tra heartbeat trước khi tiếp tục đọc; đây là vòng đời lease, không phải lỗi HTTP response.

**Chưa biết/giới hạn:** Không có bằng chứng target platform lỗi; thời điểm hết hạn không đo được từ body do chưa có request mới.

**Hướng xử lý:** Đối chiếu expiresAt/heartbeat và thay lease theo policy giữ cursor. Phân loại như sự kiện vòng đời cần theo dõi, tách khỏi sự cố mạng.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `proxy_heartbeat` |
| originalReason | `PROXY_EXPIRED` |
| nativeCode | `PROXY_EXPIRED` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `—` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `03b558cb5d85e138bd1e829fc1dd915043b3be1e302608fd6f913606ef52823b`; event ID: `3838426b-3fe2-4da1-b1b9-abccf3f56de5`.
- Thời điểm: **30/10/2026 01:29:41.653 ICT**; mức `read_retry`; retry đã ghi: `2`.
- Source: [https://www.facebook.com/groups/2248797612030784](https://www.facebook.com/groups/2248797612030784).
- Request route: `—`.
- elapsedMs=—; wireBytes=—; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `d315f663ead47476675cf7808b99870727ed7b681348e9e8f1d79de0860408e9` (không phải địa chỉ/credential proxy).

Không có wire timing trong case này; không suy đoán DNS/TCP/TLS/HTTP stage từ elapsed bị thiếu.

### Case 2

- Job ID: `d9feebea3908b6c6a5330498b00bbee4b9283d05fe97032cd6e9db71923a3bdc`; event ID: `acf67b52-9df4-4c6b-a40f-b1366fa91e2f`.
- Thời điểm: **30/10/2026 01:38:29.377 ICT**; mức `read_retry`; retry đã ghi: `4`.
- Source: [https://www.facebook.com/groups/2382834391960589](https://www.facebook.com/groups/2382834391960589).
- Request route: `—`.
- elapsedMs=—; wireBytes=—; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `95596101280f3fe35027a8c45359a828b7ef8262f3814efbf3d4224be8e7ecb4` (không phải địa chỉ/credential proxy).

Không có wire timing trong case này; không suy đoán DNS/TCP/TLS/HTTP stage từ elapsed bị thiếu.

## G085 — facebook-user-source / NETWORK_ERROR

`NETWORK_ERROR__RESPONSE_HEADERS__ECONNRESET__SOURCE`

Group key: `3bca835508ed349973f21691490499430a4efc3773e53edefe5c3587df129d5d`. Lần đầu 30/10/2026 00:49:50.627; lần cuối 30/10/2026 02:47:25.925.

**Số ghi nhận riêng từng mức:** RQ=0; RT=9; RF=0; JF=0. Tổng bản ghi quan sát=9.

**Quan sát:** Socket/TLS đã được cấp (nhiều case là socket tái sử dụng) nhưng bị reset trước khi có HTTP header.

**Chưa biết/giới hạn:** Chưa có HTTP status; không được gán thành lỗi TLS handshake hay lỗi nhận body. Có thể liên quan socket reuse, nhưng mẫu chưa chứng minh nguyên nhân.

**Hướng xử lý:** So sánh reusedSocket=true/false và vòng đời keep-alive cùng route; giữ riêng khỏi TLS và body, không tăng retry mù.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `response_headers` |
| originalReason | `NETWORK_ERROR` |
| nativeCode | `ECONNRESET` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `8a91dd2dede1b69da1d361f7131ebe3717e5067ecb606fc9d7dc7e08a65948cf`; event ID: `d1a7e009-e33b-4838-9498-bcd88c300a0b`.
- Thời điểm: **30/10/2026 00:59:16.518 ICT**; mức `read_retry`; retry đã ghi: `4`.
- Source: [https://www.facebook.com/1781592764](https://www.facebook.com/1781592764).
- Request route: `https://www.facebook.com/api/graphql/`.
- elapsedMs=437; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `dd03ca107d113c8c98e79730642743635fda075e9b4fc0d97d1344bda54bb466` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 301 / 200 | false | 1946 | 2595 | 28315 | 0 / None | true | — |
| 2 | complete / complete | 200 / None | true | 0 | 1274 | 25345 | 216529 / 1227103 | true | — |
| 3 | response_headers / error | None / None | true | 1 | — | 437 | 0 / None | — | ECONNRESET |

### Case 2

- Job ID: `e0e7cba40e390a2a78f388d29b33c0119acf82a5817e332b1acf593ae52eeccc`; event ID: `c8c4da4e-56b4-4bd3-96ff-1a65febb4de7`.
- Thời điểm: **30/10/2026 02:40:29.809 ICT**; mức `read_retry`; retry đã ghi: `4`.
- Source: [https://www.facebook.com/100001657024312](https://www.facebook.com/100001657024312).
- Request route: `https://www.facebook.com/api/graphql/`.
- elapsedMs=556; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `0a5b69321a0434d80f64a0f01bfae6709b1a1834cf12b44cba9c3fa93bfaddbc` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 301 / 200 | false | 2669 | 3638 | 30980 | 0 / None | true | — |
| 2 | complete / complete | 200 / None | true | 0 | 1280 | 26097 | 196784 / 1208530 | true | — |
| 3 | response_headers / error | None / None | true | 0 | — | 556 | 0 / None | — | ECONNRESET |

## G086 — instagram-comment / PUBLIC_DATA_NOT_RETURNED

`PUBLIC_DATA_NOT_RETURNED__HTTP_RESPONSE__HTTP_200__BR__COMMENTS`

Group key: `1c3cb79fcd4a052f2ecb39aa4c91c94314d946fc538b70301f05107b1bbbd2f4`. Lần đầu 30/10/2026 00:50:37.456; lần cuối 30/10/2026 03:42:10.613.

**Số ghi nhận riêng từng mức:** RQ=0; RT=0; RF=9; JF=0. Tổng bản ghi quan sát=9.

**Quan sát:** Không có dữ liệu comment công khai dùng được trong HTTP 200; policy kết thúc lượt đọc.

**Chưa biết/giới hạn:** Chưa tách được empty hợp lệ, giới hạn anonymous hay parser không thấy node cần lấy.

**Hướng xử lý:** Ghi end/empty proof và native container/error envelope, so parent binding và cursor trong case; giữ trạng thái không xác nhận coverage.

| Thuộc tính | Giá trị |
|---|---|
| platform | `instagram` |
| phase | `http_response` |
| originalReason | `PUBLIC_DATA_NOT_RETURNED` |
| nativeCode | `—` |
| connectStatus | `200` |
| httpStatus | `200` |
| apiCode | `—` |
| operation | `comments` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `br` |
| wireComplete | `true` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `f78b2a1ce7334cc28b88aa1209961cca69fcb58cef41b2dd4f2bbf4227f30ac0`; event ID: `1e02bbe9-89be-4610-b76b-ff699bdce833`.
- Thời điểm: **30/10/2026 01:02:22.787 ICT**; mức `read_failure`; retry đã ghi: `0`.
- Source: [https://www.instagram.com/trinh.phamm/](https://www.instagram.com/trinh.phamm/).
- Post: [https://www.instagram.com/reel/DfCqmFZPJku/](https://www.instagram.com/reel/DfCqmFZPJku/).
- Request route: `—`.
- elapsedMs=14764; wireBytes=104288; decodedBytes=511550; wireComplete=true.
- Proxy endpoint hash: `e6f397cb2ff59e4087b3932cfac8e3a813a0df748eb91ebf76ae58e6e0c59d71` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 200 / 200 | false | 2968 | 4043 | 14764 | 104288 / 511550 | true | — |

### Case 2

- Job ID: `77475e9a5cfbb5b9bf1f4a7b4efdee184757608880b7a92af624f68b518d2993`; event ID: `4e84081e-67d9-48cb-8a5b-ed6567734d9a`.
- Thời điểm: **30/10/2026 03:42:10.613 ICT**; mức `read_failure`; retry đã ghi: `7`.
- Source: [https://www.instagram.com/imsondang/](https://www.instagram.com/imsondang/).
- Post: [https://www.instagram.com/reel/DfCRHk8SmUf/](https://www.instagram.com/reel/DfCRHk8SmUf/).
- Request route: `—`.
- elapsedMs=13811; wireBytes=104252; decodedBytes=510998; wireComplete=true.
- Proxy endpoint hash: `b8e31946f60323d860e53d5c3556ae3d5dc55f8088a58e362d4008a54a8dbc90` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 200 / 200 | false | 2527 | 3468 | 13811 | 104252 / 510998 | true | — |

## G087 — facebook-comment / NETWORK_ERROR

`NETWORK_ERROR__RESPONSE_HEADERS__ECONNRESET__COMMENTS__COMMENTLISTCOMPONENTSROOTQUERY`

Group key: `095678e3d19adbe3ac2933f13ed7817e44c2756b6a4f43c9b20bc4c53880d8fc`. Lần đầu 30/10/2026 00:47:32.352; lần cuối 30/10/2026 03:48:45.245.

**Số ghi nhận riêng từng mức:** RQ=0; RT=9; RF=0; JF=0. Tổng bản ghi quan sát=9.

**Quan sát:** Socket/TLS đã được cấp (nhiều case là socket tái sử dụng) nhưng bị reset trước khi có HTTP header.

**Chưa biết/giới hạn:** Chưa có HTTP status; không được gán thành lỗi TLS handshake hay lỗi nhận body. Có thể liên quan socket reuse, nhưng mẫu chưa chứng minh nguyên nhân.

**Hướng xử lý:** So sánh reusedSocket=true/false và vòng đời keep-alive cùng route; giữ riêng khỏi TLS và body, không tăng retry mù.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `response_headers` |
| originalReason | `NETWORK_ERROR` |
| nativeCode | `ECONNRESET` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `comments` |
| query | `CommentListComponentsRootQuery` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `b0fa0a8f29ca2696bcd155c100f3c91520e5d87a3273f29de02f35ff91b26160`; event ID: `0d1f7f24-bd89-43e7-8a37-0694b1d6c2fb`.
- Thời điểm: **30/10/2026 00:55:15.173 ICT**; mức `read_retry`; retry đã ghi: `1`.
- Source: [https://www.facebook.com/groups/1002909997790787](https://www.facebook.com/groups/1002909997790787).
- Post: [https://www.facebook.com/1002909997790787_1853290686086043](https://www.facebook.com/1002909997790787_1853290686086043).
- Request route: `https://www.facebook.com/api/graphql/`.
- elapsedMs=387; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `1eb70dfc8882a9198e1c886a51c67c18f567b20bbf8898d43dc6268e72eb9df1` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 301 / 200 | false | 2729 | 3536 | 30001 | 0 / None | true | — |
| 2 | complete / complete | 200 / None | true | 0 | 1438 | 25671 | 142798 / 858075 | true | — |
| 3 | response_headers / error | None / None | true | 1 | — | 387 | 0 / None | — | ECONNRESET |

### Case 2

- Job ID: `832b4370ab7ebae11baba2529780f3678ca72aea3ef542993363aecdc6ebdb85`; event ID: `c2155947-df5d-4443-81d5-842e86cfbbbb`.
- Thời điểm: **30/10/2026 03:47:34.885 ICT**; mức `read_retry`; retry đã ghi: `1`.
- Source: [https://www.facebook.com/groups/2049483769244056](https://www.facebook.com/groups/2049483769244056).
- Post: [https://www.facebook.com/2049483769244056_2234366364089128](https://www.facebook.com/2049483769244056_2234366364089128).
- Request route: `https://www.facebook.com/api/graphql/`.
- elapsedMs=823; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `dbb1e32e5f920e42d798bde24ffe5887247477b26e901f623f2c9357b46789eb` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 301 / 200 | false | 1616 | 2377 | 19037 | 0 / None | true | — |
| 2 | complete / complete | 200 / None | true | 0 | 1222 | 15884 | 138783 / 835098 | true | — |
| 3 | response_headers / error | None / None | true | 1 | — | 823 | 0 / None | — | ECONNRESET |

## G088 — facebook-comment / UPSTREAM_NETWORK_ERROR

`UPSTREAM_NETWORK_ERROR__RESPONSE_HEADERS__ECONNRESET__COMMENTS__COMMENTLISTCOMPONENTSROOTQUERY`

Group key: `ef0b85c1dd4044f13cf58a4f35c45de923c0023931f56776563c6de1623eae25`. Lần đầu 30/10/2026 00:47:32.137; lần cuối 30/10/2026 03:48:44.779.

**Số ghi nhận riêng từng mức:** RQ=9; RT=0; RF=0; JF=0. Tổng bản ghi quan sát=9.

**Quan sát:** Socket/TLS đã được cấp (nhiều case là socket tái sử dụng) nhưng bị reset trước khi có HTTP header.

**Chưa biết/giới hạn:** Chưa có HTTP status; không được gán thành lỗi TLS handshake hay lỗi nhận body. Có thể liên quan socket reuse, nhưng mẫu chưa chứng minh nguyên nhân.

**Hướng xử lý:** So sánh reusedSocket=true/false và vòng đời keep-alive cùng route; giữ riêng khỏi TLS và body, không tăng retry mù.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `response_headers` |
| originalReason | `UPSTREAM_NETWORK_ERROR` |
| nativeCode | `ECONNRESET` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `comments` |
| query | `CommentListComponentsRootQuery` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `b0fa0a8f29ca2696bcd155c100f3c91520e5d87a3273f29de02f35ff91b26160`; event ID: `7b78844a-d3a1-48bf-af20-9ecdb26788bd`.
- Thời điểm: **30/10/2026 00:55:15.083 ICT**; mức `request_error`; retry đã ghi: `0`.
- Source: [https://www.facebook.com/groups/1002909997790787](https://www.facebook.com/groups/1002909997790787).
- Post: [https://www.facebook.com/1002909997790787_1853290686086043](https://www.facebook.com/1002909997790787_1853290686086043).
- Request route: `https://www.facebook.com/api/graphql/`.
- elapsedMs=387; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `1eb70dfc8882a9198e1c886a51c67c18f567b20bbf8898d43dc6268e72eb9df1` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 3 | response_headers / error | None / None | true | 1 | — | 387 | 0 / None | — | ECONNRESET |

### Case 2

- Job ID: `cfe89f719fa459ca110251678a19850ab10d1af17c9206d161fd6347c80802e5`; event ID: `2fd74de6-6e2f-4548-b99c-9f2e6f09a9b0`.
- Thời điểm: **30/10/2026 03:48:44.779 ICT**; mức `request_error`; retry đã ghi: `0`.
- Source: [https://www.facebook.com/groups/205481323371170](https://www.facebook.com/groups/205481323371170).
- Post: [https://www.facebook.com/205481323371170_2255482395037709](https://www.facebook.com/205481323371170_2255482395037709).
- Request route: `https://www.facebook.com/api/graphql/`.
- elapsedMs=373; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `6435ac2d8b512f971652983ba5bdded2f76be7ba79bdecea77c799dd8f0b900c` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 3 | response_headers / error | None / None | true | 0 | — | 373 | 0 / None | — | ECONNRESET |

## G089 — facebook-user-source / UPSTREAM_NETWORK_ERROR

`UPSTREAM_NETWORK_ERROR__RESPONSE_HEADERS__ECONNRESET__SOURCE`

Group key: `e3363440c7784a54136792976a00ed2a02bf698571d6e077474bcb8d7fff2588`. Lần đầu 30/10/2026 00:49:50.359; lần cuối 30/10/2026 02:47:25.820.

**Số ghi nhận riêng từng mức:** RQ=9; RT=0; RF=0; JF=0. Tổng bản ghi quan sát=9.

**Quan sát:** Socket/TLS đã được cấp (nhiều case là socket tái sử dụng) nhưng bị reset trước khi có HTTP header.

**Chưa biết/giới hạn:** Chưa có HTTP status; không được gán thành lỗi TLS handshake hay lỗi nhận body. Có thể liên quan socket reuse, nhưng mẫu chưa chứng minh nguyên nhân.

**Hướng xử lý:** So sánh reusedSocket=true/false và vòng đời keep-alive cùng route; giữ riêng khỏi TLS và body, không tăng retry mù.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `response_headers` |
| originalReason | `UPSTREAM_NETWORK_ERROR` |
| nativeCode | `ECONNRESET` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `1ce398cd465c2caf91c7bee9a079ccbc292969d41de4a171c713211c4db860f2`; event ID: `157e339e-eb66-451c-bdef-7f1ef6cd7c27`.
- Thời điểm: **30/10/2026 01:15:30.288 ICT**; mức `request_error`; retry đã ghi: `0`.
- Source: [https://www.facebook.com/100004547253309](https://www.facebook.com/100004547253309).
- Request route: `https://www.facebook.com/api/graphql/`.
- elapsedMs=328; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `42ee874e1acc169f4ce44a74c10bb52659d42b7761bb8049c8ce8ef8e926f544` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 3 | response_headers / error | None / None | true | 1 | — | 328 | 0 / None | — | ECONNRESET |

### Case 2

- Job ID: `2b2c1a7eb7edff305e5ed096c153fa0720f9a283b98235faec9495c9237ae652`; event ID: `a0e97bc4-b430-4ebc-a577-76fdbe58efee`.
- Thời điểm: **30/10/2026 01:34:22.388 ICT**; mức `request_error`; retry đã ghi: `0`.
- Source: [https://www.facebook.com/100009784487138](https://www.facebook.com/100009784487138).
- Request route: `https://www.facebook.com/api/graphql/`.
- elapsedMs=321; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `494b6bd8a59601c5d60882de51c875b491ad5b7af827c0a51a2a59c2dfad3460` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 3 | response_headers / error | None / None | true | 0 | — | 321 | 0 / None | — | ECONNRESET |

## G090 — facebook-comment / FACEBOOK_RATE_LIMITED

`FACEBOOK_RATE_LIMITED__HTTP_RESPONSE__HTTP_200__API_1675004__BR__COMMENTS__COMMENTLISTCOMPONENTSROOTQUERY`

Group key: `422c70a91c2392975fb1c5b641ac2581df522c51389ff6ed3d213b981faa2965`. Lần đầu 30/10/2026 00:51:11.928; lần cuối 30/10/2026 02:40:16.872.

**Số ghi nhận riêng từng mức:** RQ=0; RT=8; RF=0; JF=0. Tổng bản ghi quan sát=8.

**Quan sát:** Facebook GraphQL trả lỗi được reader phân loại rate limit bên trong HTTP 200; native API code được giữ là 1675004, query CommentListComponentsRootQuery.

**Chưa biết/giới hạn:** Chưa giữ native message chi tiết, nên không gán nghĩa mở rộng cho riêng mã 1675004 ngoài classifier hiện tại; không phải HTTP 429.

**Hướng xử lý:** Đối chiếu native error envelope/query và áp lực theo operation. Xác nhận cách chờ/Retry-After phù hợp trước khi đổi policy; không xem tất cả là lỗi TCP/TLS.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `http_response` |
| originalReason | `FACEBOOK_RATE_LIMITED` |
| nativeCode | `—` |
| connectStatus | `200` |
| httpStatus | `200` |
| apiCode | `1675004` |
| operation | `comments` |
| query | `CommentListComponentsRootQuery` |
| stage | `—` |
| bodyEncoding | `br` |
| wireComplete | `true` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `b7149accd7f22801a9198132fc8b1dfc1590811a928efc6e8d8f0a895c53e537`; event ID: `377ebe0f-7eb7-4b75-9f02-cf89aee58f2e`.
- Thời điểm: **30/10/2026 00:55:14.973 ICT**; mức `read_retry`; retry đã ghi: `1`.
- Source: [https://www.facebook.com/groups/1002909997790787](https://www.facebook.com/groups/1002909997790787).
- Post: [https://www.facebook.com/1002909997790787_1852564599491985](https://www.facebook.com/1002909997790787_1852564599491985).
- Request route: `—`.
- elapsedMs=3719; wireBytes=104; decodedBytes=114; wireComplete=true.
- Proxy endpoint hash: `632b7efa8c7957d1bc73e54ed16afbe3ab31063beb563ee539c83a3329320f45` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 301 / 200 | false | 2170 | 2738 | 29757 | 0 / None | true | — |
| 2 | complete / complete | 200 / None | true | 0 | 1234 | 26709 | 140808 / 874842 | true | — |
| 3 | complete / complete | 200 / 200 | false | 1914 | 3207 | 3719 | 104 / 114 | true | — |

### Case 2

- Job ID: `8aeaf896f419c72195f5cd7d7fbaea227b543cad71a2527da0e7e5a28e43fca9`; event ID: `05289301-d348-457c-9d9a-d8c6d447745d`.
- Thời điểm: **30/10/2026 02:40:16.872 ICT**; mức `read_retry`; retry đã ghi: `5`.
- Source: [https://www.facebook.com/groups/1492386304490226](https://www.facebook.com/groups/1492386304490226).
- Post: [https://www.facebook.com/1492386304490226_2759272897801554](https://www.facebook.com/1492386304490226_2759272897801554).
- Request route: `—`.
- elapsedMs=4420; wireBytes=104; decodedBytes=114; wireComplete=true.
- Proxy endpoint hash: `9e1c4ce350af423e000416c11bd26ab4624c26ab69ca4e481820f4a03a5019aa` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 301 / 200 | false | 2426 | 3273 | 29803 | 0 / None | true | — |
| 2 | complete / complete | 200 / None | true | 0 | 1053 | 26045 | 223199 / 1180476 | true | — |
| 3 | complete / complete | 200 / 200 | false | 3015 | 3782 | 4420 | 104 / 114 | true | — |

## G091 — threads-comment / UPSTREAM_TIMEOUT

`UPSTREAM_TIMEOUT__UNOBSERVED__COMMENTS`

Group key: `ba74f3cd797b08041eb055d45a0fd0a12267e87a6c96d2b4e1624fc39f6417fb`. Lần đầu 30/10/2026 01:01:28.732; lần cuối 30/10/2026 03:29:21.356.

**Số ghi nhận riêng từng mức:** RQ=0; RT=8; RF=0; JF=0. Tổng bản ghi quan sát=8.

**Quan sát:** Hết thời gian của lượt đọc, nhưng không có networkTimings để định vị đến DNS/CONNECT/TLS/header/body.

**Chưa biết/giới hạn:** UPSTREAM_TIMEOUT là mã tổng hợp của ứng dụng; không phải bằng chứng native ETIMEDOUT. Không có elapsedMs ở các case này.

**Hướng xử lý:** Bổ sung trace trước acquisition/permit/request và giữ timing khi dispose/timeout. Giữ nhóm UNOBSERVED riêng; dùng job ID/cursor của case để tái hiện, không gán nguyên nhân cho proxy.

| Thuộc tính | Giá trị |
|---|---|
| platform | `threads` |
| phase | `unobserved` |
| originalReason | `UPSTREAM_TIMEOUT` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `comments` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `—` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `10a9eefe72d4dbdea3397b109d9e80953a313d36c555deb336d0aa4c6856beb5`; event ID: `16db946b-2449-4739-bf57-b688748d79a6`.
- Thời điểm: **30/10/2026 02:26:04.278 ICT**; mức `read_retry`; retry đã ghi: `6`.
- Source: [https://www.threads.com/@doclabinhvuong](https://www.threads.com/@doclabinhvuong).
- Post: [https://www.threads.com/@doclabinhvuong/post/DfEGaY2j5pr](https://www.threads.com/@doclabinhvuong/post/DfEGaY2j5pr).
- Request route: `—`.
- elapsedMs=—; wireBytes=—; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `dd03ca107d113c8c98e79730642743635fda075e9b4fc0d97d1344bda54bb466` (không phải địa chỉ/credential proxy).

Không có wire timing trong case này; không suy đoán DNS/TCP/TLS/HTTP stage từ elapsed bị thiếu.

### Case 2

- Job ID: `dbad913a59bc819c1f64f276ff547a7667998ff6bae1837584a514bf85800e18`; event ID: `b6afd6d7-dd81-4c0b-98cf-fa5c7e054dcc`.
- Thời điểm: **30/10/2026 02:30:24.132 ICT**; mức `read_retry`; retry đã ghi: `10`.
- Source: [https://www.threads.com/@thegioididong_official/](https://www.threads.com/@thegioididong_official/).
- Post: [https://www.threads.com/@thegioididong_official/post/DfCd21jEucw](https://www.threads.com/@thegioididong_official/post/DfCd21jEucw).
- Request route: `—`.
- elapsedMs=—; wireBytes=—; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `dda391ca5d52fff0621a1dac7434f1b6d70181bea38ddccb5008c9180d06d472` (không phải địa chỉ/credential proxy).

Không có wire timing trong case này; không suy đoán DNS/TCP/TLS/HTTP stage từ elapsed bị thiếu.

## G092 — facebook-page-source / FEED_UNAVAILABLE

`FEED_UNAVAILABLE__HTTP_RESPONSE__HTTP_200__BR__SOURCE`

Group key: `f9ebe3300f6a08d891c34eaca67a45fb3d281b4fd2b7c7c5885cc5190126a49a`. Lần đầu 30/10/2026 00:48:06.938; lần cuối 30/10/2026 03:56:46.495.

**Số ghi nhận riêng từng mức:** RQ=0; RT=0; RF=8; JF=0. Tổng bản ghi quan sát=8.

**Quan sát:** Reader Facebook không có feed công khai dùng được trong HTTP 200 ở source này.

**Chưa biết/giới hạn:** Không đồng nghĩa source không tồn tại, bị xóa hoặc private; không có bằng chứng native đủ cho kết luận đó.

**Hướng xử lý:** Kiểm tra route source, canonical binding và native feed/error node bằng case công khai, giữ nhóm unavailable riêng khỏi HTTP lỗi.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `http_response` |
| originalReason | `FEED_UNAVAILABLE` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `200` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `br` |
| wireComplete | `true` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `c81e0a415604f3aeaf0955c515f0db09a176e3be01ba61602a4019ba460b6756`; event ID: `3d1a9aeb-79d4-41d0-b765-6488242ccf0a`.
- Thời điểm: **30/10/2026 00:48:06.938 ICT**; mức `read_failure`; retry đã ghi: `0`.
- Source: [https://www.facebook.com/306698752536797](https://www.facebook.com/306698752536797).
- Request route: `—`.
- elapsedMs=1918; wireBytes=110; decodedBytes=144; wireComplete=true.
- Proxy endpoint hash: `b8e31946f60323d860e53d5c3556ae3d5dc55f8088a58e362d4008a54a8dbc90` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 200 / 200 | false | 1858 | 2500 | 15060 | 68974 / 312178 | true | — |
| 2 | complete / complete | 200 / None | true | 1 | 1362 | 1918 | 110 / 144 | true | — |

### Case 2

- Job ID: `99f065ce24fd1a72cc369a7544b94b9c38ed7e030dc6353c55f596fa48495d22`; event ID: `b286608f-8a68-4589-8300-75b55e2b7ca3`.
- Thời điểm: **30/10/2026 02:10:41.684 ICT**; mức `read_failure`; retry đã ghi: `0`.
- Source: [https://www.facebook.com/100291028370022](https://www.facebook.com/100291028370022).
- Request route: `—`.
- elapsedMs=1409; wireBytes=110; decodedBytes=144; wireComplete=true.
- Proxy endpoint hash: `dda391ca5d52fff0621a1dac7434f1b6d70181bea38ddccb5008c9180d06d472` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 200 / 200 | false | 1966 | 2579 | 8900 | 69002 / 311890 | true | — |
| 2 | complete / complete | 200 / None | true | 1 | 954 | 1409 | 110 / 144 | true | — |

## G093 — facebook-page-source / PROXY_EXPIRED

`PROXY_EXPIRED__PROXY_HEARTBEAT__PROXY_EXPIRED__SOURCE`

Group key: `02fcdc325ba7e0b70289c6ed50024a9057e580acd6f8af909b283091797947d1`. Lần đầu 30/10/2026 01:12:14.526; lần cuối 30/10/2026 03:47:14.989.

**Số ghi nhận riêng từng mức:** RQ=0; RT=8; RF=0; JF=0. Tổng bản ghi quan sát=8.

**Quan sát:** Lease đã hết hạn khi kiểm tra heartbeat trước khi tiếp tục đọc; đây là vòng đời lease, không phải lỗi HTTP response.

**Chưa biết/giới hạn:** Không có bằng chứng target platform lỗi; thời điểm hết hạn không đo được từ body do chưa có request mới.

**Hướng xử lý:** Đối chiếu expiresAt/heartbeat và thay lease theo policy giữ cursor. Phân loại như sự kiện vòng đời cần theo dõi, tách khỏi sự cố mạng.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `proxy_heartbeat` |
| originalReason | `PROXY_EXPIRED` |
| nativeCode | `PROXY_EXPIRED` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `—` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `7a5a6d3bb61436503eda8a5a258506a8784bbb9716a7e4eb5dafd7c3ad39668b`; event ID: `6677c5e3-bf58-4515-929f-383de87dc680`.
- Thời điểm: **30/10/2026 01:12:14.526 ICT**; mức `read_retry`; retry đã ghi: `12`.
- Source: [https://www.facebook.com/345033318906366](https://www.facebook.com/345033318906366).
- Request route: `—`.
- elapsedMs=—; wireBytes=—; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `81c3919b9ce4f4f291fae6572db9b0feea68a0b6c6fd0f770c5497835aea2e86` (không phải địa chỉ/credential proxy).

Không có wire timing trong case này; không suy đoán DNS/TCP/TLS/HTTP stage từ elapsed bị thiếu.

### Case 2

- Job ID: `1e4a9121a9274826667f16e34d4c6adcf7c8b0dddad0115a58f45b7f2c549afc`; event ID: `e4a71ca4-1de7-48e0-8132-a51a51e2ddd6`.
- Thời điểm: **30/10/2026 02:27:25.243 ICT**; mức `read_retry`; retry đã ghi: `1`.
- Source: [https://www.facebook.com/103760261535467](https://www.facebook.com/103760261535467).
- Request route: `—`.
- elapsedMs=—; wireBytes=—; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `9e1c4ce350af423e000416c11bd26ab4624c26ab69ca4e481820f4a03a5019aa` (không phải địa chỉ/credential proxy).

Không có wire timing trong case này; không suy đoán DNS/TCP/TLS/HTTP stage từ elapsed bị thiếu.

## G094 — instagram-comment / LOGIN_OR_CHECKPOINT

`LOGIN_OR_CHECKPOINT__HTTP_RESPONSE__HTTP_200__BR__COMMENTS`

Group key: `fb11bcef5cf076783699fa38b19ce750c05f36dbb0378e582b403a7178045f37`. Lần đầu 30/10/2026 00:47:41.048; lần cuối 30/10/2026 03:20:07.597.

**Số ghi nhận riêng từng mức:** RQ=0; RT=7; RF=0; JF=0. Tổng bản ghi quan sát=7.

**Quan sát:** Reader Meta nhận diện login/checkpoint trong body HTTP 200; một số case xảy ra sau khi đã nhận dữ liệu công khai.

**Chưa biết/giới hạn:** Không có source_restriction confirmed=true; chưa chứng minh source private hay endpoint bị chặn.

**Hướng xử lý:** Phân biệt login, checkpoint và gate sau dữ liệu bằng tín hiệu native đã khử bí mật. Đối chiếu cùng source/route, không suy ra privacy từ một trang login.

| Thuộc tính | Giá trị |
|---|---|
| platform | `instagram` |
| phase | `http_response` |
| originalReason | `LOGIN_OR_CHECKPOINT` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `200` |
| apiCode | `—` |
| operation | `comments` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `br` |
| wireComplete | `true` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `fa0b1ceaac8f303299efbef77d2806f9f54dd0011ef3bb9b2d43ed4ef438f2de`; event ID: `e43cf2d9-2f01-4e3a-97ab-92f331dce3bb`.
- Thời điểm: **30/10/2026 00:47:41.048 ICT**; mức `read_retry`; retry đã ghi: `23`.
- Source: [https://www.instagram.com/dpidamu/](https://www.instagram.com/dpidamu/).
- Post: [https://www.instagram.com/reel/DfCp8BZSAk9/](https://www.instagram.com/reel/DfCp8BZSAk9/).
- Request route: `—`.
- elapsedMs=11543; wireBytes=93284; decodedBytes=422391; wireComplete=true.
- Proxy endpoint hash: `3e473a7f05269e6b6350a75fb3dc72787cee0c8235a4f84a8790ba61609177b6` (không phải địa chỉ/credential proxy).
- Auth evidence: `{"classification": "login_after_public_data", "confirmed": false, "stage": "after_public_data", "evidence": "anonymous_login_or_checkpoint"}`.

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 302 / 200 | false | 2996 | 4769 | 18092 | 0 / None | true | — |
| 2 | complete / complete | 200 / None | true | 1 | 895 | 11543 | 93284 / 422391 | true | — |

### Case 2

- Job ID: `8e670333232ef8951768ec8cdf158481590c986eea92bb5fe355dcf8477770e8`; event ID: `286a353e-4b2f-4c77-b6f3-21e267278823`.
- Thời điểm: **30/10/2026 01:57:58.938 ICT**; mức `read_retry`; retry đã ghi: `42`.
- Source: [https://www.instagram.com/misscosmointernational/](https://www.instagram.com/misscosmointernational/).
- Post: [https://www.instagram.com/p/De9OrY7RrmP/](https://www.instagram.com/p/De9OrY7RrmP/).
- Request route: `—`.
- elapsedMs=9750; wireBytes=93274; decodedBytes=425279; wireComplete=true.
- Proxy endpoint hash: `9e1c4ce350af423e000416c11bd26ab4624c26ab69ca4e481820f4a03a5019aa` (không phải địa chỉ/credential proxy).
- Auth evidence: `{"classification": "login_after_public_data", "confirmed": false, "stage": "after_public_data", "evidence": "anonymous_login_or_checkpoint"}`.

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 302 / 200 | false | 2027 | 2893 | 13037 | 0 / None | true | — |
| 2 | complete / complete | 200 / None | true | 0 | 706 | 9750 | 93274 / 425279 | true | — |

## G095 — facebook-user-source / AUTH_REQUIRED

`AUTH_REQUIRED__HTTP_RESPONSE__HTTP_200__BR__BOOTSTRAP__BOOTSTRAP`

Group key: `6c6ec9a0bfaf5177f37faa48f43f22523a7ba6f4152abfdb8df581af64cbd03f`. Lần đầu 30/10/2026 01:47:50.613; lần cuối 30/10/2026 02:55:16.054.

**Số ghi nhận riêng từng mức:** RQ=0; RT=7; RF=0; JF=0. Tổng bản ghi quan sát=7.

**Quan sát:** HTTP 200 đã nhận đủ body; reader nhận diện nội dung yêu cầu đăng nhập tại bootstrap. Đây là cổng xác thực ở mức nội dung, không phải HTTP 401 hay reset socket.

**Chưa biết/giới hạn:** Toàn bộ mẫu auth trong cửa sổ có confirmed=false; một số xuất hiện sau khi đã có dữ liệu công khai. Chưa chứng minh source private, proxy bị chặn, hay template chắc chắn sai.

**Hướng xử lý:** Đối chiếu cùng source qua endpoint khác bằng phiên anonymous sạch và giữ dấu hiệu login/route đã khử bí mật. Tách trường hợp ban đầu với sau dữ liệu công khai; không gắn nhãn private chỉ từ login page.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `http_response` |
| originalReason | `AUTH_REQUIRED` |
| nativeCode | `—` |
| connectStatus | `200` |
| httpStatus | `200` |
| apiCode | `—` |
| operation | `bootstrap` |
| query | `bootstrap` |
| stage | `—` |
| bodyEncoding | `br` |
| wireComplete | `true` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `f69897cd48e96e27de511d5517e2b2b5b1e035af52352c30a04506757f3d1ef7`; event ID: `963aac94-e3e1-49e1-aea1-af77eff684a7`.
- Thời điểm: **30/10/2026 02:48:51.206 ICT**; mức `read_retry`; retry đã ghi: `2`.
- Source: [https://www.facebook.com/100002403311226](https://www.facebook.com/100002403311226).
- Request route: `—`.
- elapsedMs=12641; wireBytes=75628; decodedBytes=364727; wireComplete=true.
- Proxy endpoint hash: `2becb4985e92d60fe4ef9e97d04f2f9c303e486e180844eaab3f716aae6f9533` (không phải địa chỉ/credential proxy).
- Auth evidence: `{"classification": "unverified", "confirmed": false, "stage": "initial", "evidence": "anonymous_login_or_checkpoint"}`.

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 302 / 200 | false | 2124 | 2731 | 16978 | 0 / None | true | — |
| 2 | complete / complete | 302 / None | true | 0 | 753 | 14029 | 0 / None | true | — |
| 3 | complete / complete | 200 / 200 | false | 1800 | 2410 | 12641 | 75628 / 364727 | true | — |

### Case 2

- Job ID: `17b990fcb53409a0fcdb0f1ab860d7aa5563a264bfb28c09c308ca6333ac8d76`; event ID: `14a9033e-1ecf-423c-9f09-3f22201fc2b8`.
- Thời điểm: **30/10/2026 02:49:14.579 ICT**; mức `read_retry`; retry đã ghi: `2`.
- Source: [https://www.facebook.com/100002478946812](https://www.facebook.com/100002478946812).
- Request route: `—`.
- elapsedMs=13010; wireBytes=75180; decodedBytes=362669; wireComplete=true.
- Proxy endpoint hash: `2becb4985e92d60fe4ef9e97d04f2f9c303e486e180844eaab3f716aae6f9533` (không phải địa chỉ/credential proxy).
- Auth evidence: `{"classification": "unverified", "confirmed": false, "stage": "initial", "evidence": "anonymous_login_or_checkpoint"}`.

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 302 / 200 | false | 2730 | 3535 | 18111 | 0 / None | true | — |
| 2 | complete / complete | 302 / None | true | 0 | 620 | 13856 | 0 / None | true | — |
| 3 | complete / complete | 200 / 200 | false | 2383 | 3381 | 13010 | 75180 / 362669 | true | — |

## G096 — threads-comment / UPSTREAM_NETWORK_ERROR

`UPSTREAM_NETWORK_ERROR__RESPONSE_HEADERS__ECONNRESET__COMMENTS`

Group key: `e29d71807625bb0f1868540e07193f3f5fc2c6eaf6516aa75faea8a90b3b2c41`. Lần đầu 30/10/2026 00:59:38.530; lần cuối 30/10/2026 02:40:15.313.

**Số ghi nhận riêng từng mức:** RQ=3; RT=3; RF=0; JF=0. Tổng bản ghi quan sát=6.

**Quan sát:** Socket/TLS đã được cấp (nhiều case là socket tái sử dụng) nhưng bị reset trước khi có HTTP header.

**Chưa biết/giới hạn:** Chưa có HTTP status; không được gán thành lỗi TLS handshake hay lỗi nhận body. Có thể liên quan socket reuse, nhưng mẫu chưa chứng minh nguyên nhân.

**Hướng xử lý:** So sánh reusedSocket=true/false và vòng đời keep-alive cùng route; giữ riêng khỏi TLS và body, không tăng retry mù.

| Thuộc tính | Giá trị |
|---|---|
| platform | `threads` |
| phase | `response_headers` |
| originalReason | `UPSTREAM_NETWORK_ERROR` |
| nativeCode | `ECONNRESET` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `comments` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `b4e91ea2e6ba3de7bf466e83505693773fd253b8a347e167ddf51d93aa64a133`; event ID: `42cd0461-25a5-4712-8bde-a0a185d79d3d`.
- Thời điểm: **30/10/2026 00:59:38.530 ICT**; mức `request_error`; retry đã ghi: `2`.
- Source: [https://www.threads.com/@centimett](https://www.threads.com/@centimett).
- Post: [https://www.threads.com/@centimett/post/DfCYhHLI6GL](https://www.threads.com/@centimett/post/DfCYhHLI6GL).
- Request route: `https://www.threads.com/api/graphql`.
- elapsedMs=649; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `95596101280f3fe35027a8c45359a828b7ef8262f3814efbf3d4224be8e7ecb4` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 2 | response_headers / error | None / None | true | 1 | — | 649 | 0 / None | — | ECONNRESET |

### Case 2

- Job ID: `dbad913a59bc819c1f64f276ff547a7667998ff6bae1837584a514bf85800e18`; event ID: `630ddacf-ebd6-4b1a-bb2a-f17dc7cfee53`.
- Thời điểm: **30/10/2026 02:40:15.040 ICT**; mức `request_error`; retry đã ghi: `29`.
- Source: [https://www.threads.com/@thegioididong_official/](https://www.threads.com/@thegioididong_official/).
- Post: [https://www.threads.com/@thegioididong_official/post/DfCd21jEucw](https://www.threads.com/@thegioididong_official/post/DfCd21jEucw).
- Request route: `https://www.threads.com/api/graphql`.
- elapsedMs=1055; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `1eb70dfc8882a9198e1c886a51c67c18f567b20bbf8898d43dc6268e72eb9df1` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 2 | response_headers / error | None / None | true | 1 | — | 1055 | 0 / None | — | ECONNRESET |

## G097 — threads-source / ECONNRESET

`ECONNRESET__RESPONSE_HEADERS__ECONNRESET__SOURCE`

Group key: `592ac97c62047ec024224a2844a5f9435f359ffe8083671efeae1ab89db38aec`. Lần đầu 30/10/2026 00:52:52.773; lần cuối 30/10/2026 01:24:14.897.

**Số ghi nhận riêng từng mức:** RQ=0; RT=6; RF=0; JF=0. Tổng bản ghi quan sát=6.

**Quan sát:** Socket/TLS đã được cấp (nhiều case là socket tái sử dụng) nhưng bị reset trước khi có HTTP header.

**Chưa biết/giới hạn:** Chưa có HTTP status; không được gán thành lỗi TLS handshake hay lỗi nhận body. Có thể liên quan socket reuse, nhưng mẫu chưa chứng minh nguyên nhân.

**Hướng xử lý:** So sánh reusedSocket=true/false và vòng đời keep-alive cùng route; giữ riêng khỏi TLS và body, không tăng retry mù.

| Thuộc tính | Giá trị |
|---|---|
| platform | `threads` |
| phase | `response_headers` |
| originalReason | `ECONNRESET` |
| nativeCode | `ECONNRESET` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `d80b0d731fb900dec6b25fecb569afa51979e5f3e669815d7a8d729b1824b8bd`; event ID: `c070bb3e-1dcf-4a06-822b-a403d4e4a71b`.
- Thời điểm: **30/10/2026 00:58:56.930 ICT**; mức `read_retry`; retry đã ghi: `6`.
- Source: [https://www.threads.com/@almirahae](https://www.threads.com/@almirahae).
- Request route: `https://www.threads.com/api/graphql`.
- elapsedMs=288; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `494b6bd8a59601c5d60882de51c875b491ad5b7af827c0a51a2a59c2dfad3460` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 2 | response_headers / error | None / None | true | 0 | — | 288 | 0 / None | — | ECONNRESET |

### Case 2

- Job ID: `3c2839584d101e49a71f3547dfd98195857b9cd223755bf5f5f921ccb6269b00`; event ID: `cb32efbe-8158-40e4-91c6-a0255d6650b6`.
- Thời điểm: **30/10/2026 01:03:13.942 ICT**; mức `read_retry`; retry đã ghi: `2`.
- Source: [https://www.threads.com/@chotuimotlycoldbrewcam_/](https://www.threads.com/@chotuimotlycoldbrewcam_/).
- Request route: `https://www.threads.com/api/graphql`.
- elapsedMs=813; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `1fbeb8474d73a6439b60037b69c1195e87ff741c1426c79cf23224b16b7f2c58` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 2 | response_headers / error | None / None | true | 0 | — | 813 | 0 / None | — | ECONNRESET |

## G098 — facebook-group-source / FEED_UNAVAILABLE

`FEED_UNAVAILABLE__HTTP_RESPONSE__HTTP_200__BR__SOURCE`

Group key: `3d0fe625e97f918664c1f486f38a4f17f86532630749ca26e0cd82c794149ebf`. Lần đầu 30/10/2026 01:13:56.646; lần cuối 30/10/2026 02:54:27.282.

**Số ghi nhận riêng từng mức:** RQ=0; RT=0; RF=6; JF=0. Tổng bản ghi quan sát=6.

**Quan sát:** Reader Facebook không có feed công khai dùng được trong HTTP 200 ở source này.

**Chưa biết/giới hạn:** Không đồng nghĩa source không tồn tại, bị xóa hoặc private; không có bằng chứng native đủ cho kết luận đó.

**Hướng xử lý:** Kiểm tra route source, canonical binding và native feed/error node bằng case công khai, giữ nhóm unavailable riêng khỏi HTTP lỗi.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `http_response` |
| originalReason | `FEED_UNAVAILABLE` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `200` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `br` |
| wireComplete | `true` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `68d87c7c7e61769ee6e92e0894ecea4b10fe57fc681ef498a936e860b46c5979`; event ID: `4c0bbedb-c2be-4ec2-a22b-870ae2bd34cd`.
- Thời điểm: **30/10/2026 01:13:56.646 ICT**; mức `read_failure`; retry đã ghi: `0`.
- Source: [https://www.facebook.com/groups/2088181741569884](https://www.facebook.com/groups/2088181741569884).
- Request route: `—`.
- elapsedMs=1142; wireBytes=110; decodedBytes=144; wireComplete=true.
- Proxy endpoint hash: `0a5b69321a0434d80f64a0f01bfae6709b1a1834cf12b44cba9c3fa93bfaddbc` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 200 / 200 | false | 2182 | 3197 | 9486 | 69027 / 312088 | true | — |
| 2 | complete / complete | 200 / None | true | 0 | 811 | 1142 | 110 / 144 | true | — |

### Case 2

- Job ID: `fdc1e0a8451986826a0deb1c7c7707fcdc11c6f8281e2d42a4de2719d65f2683`; event ID: `1b682fce-2fa0-4b80-a72a-6471da6165e6`.
- Thời điểm: **30/10/2026 02:29:05.468 ICT**; mức `read_failure`; retry đã ghi: `1`.
- Source: [https://www.facebook.com/groups/338091609680524](https://www.facebook.com/groups/338091609680524).
- Request route: `—`.
- elapsedMs=1689; wireBytes=110; decodedBytes=144; wireComplete=true.
- Proxy endpoint hash: `01a01fd0e59c6a8b21005bfea6b6b918dde95729dadb2b3e9f73a7202e51cbc2` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 200 / 200 | false | 2302 | 3379 | 8494 | 69121 / 314008 | true | — |
| 2 | complete / complete | 200 / None | true | 1 | 746 | 1689 | 110 / 144 | true | — |

## G099 — threads-source / UPSTREAM_NETWORK_ERROR

`UPSTREAM_NETWORK_ERROR__RESPONSE_HEADERS__ECONNRESET__SOURCE`

Group key: `e22893e9bd417cd201efb7b65bdbe8c9717807f93389322abf3ced9f5ead57a5`. Lần đầu 30/10/2026 00:52:52.531; lần cuối 30/10/2026 01:24:14.583.

**Số ghi nhận riêng từng mức:** RQ=6; RT=0; RF=0; JF=0. Tổng bản ghi quan sát=6.

**Quan sát:** Socket/TLS đã được cấp (nhiều case là socket tái sử dụng) nhưng bị reset trước khi có HTTP header.

**Chưa biết/giới hạn:** Chưa có HTTP status; không được gán thành lỗi TLS handshake hay lỗi nhận body. Có thể liên quan socket reuse, nhưng mẫu chưa chứng minh nguyên nhân.

**Hướng xử lý:** So sánh reusedSocket=true/false và vòng đời keep-alive cùng route; giữ riêng khỏi TLS và body, không tăng retry mù.

| Thuộc tính | Giá trị |
|---|---|
| platform | `threads` |
| phase | `response_headers` |
| originalReason | `UPSTREAM_NETWORK_ERROR` |
| nativeCode | `ECONNRESET` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `cc6a77cee74aa03f30219f293aaf86f9d87af7503ec1ac8ed40d2a8d24a5e63a`; event ID: `2887ccc5-b7fb-4c1a-835a-4d40a211ceaf`.
- Thời điểm: **30/10/2026 00:52:52.531 ICT**; mức `request_error`; retry đã ghi: `1`.
- Source: [https://www.threads.com/@haibahaibay/](https://www.threads.com/@haibahaibay/).
- Request route: `https://www.threads.com/api/graphql`.
- elapsedMs=469; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `a12f5bf8fec29ae1aa8446f8c4fc8025fee2bbc166ae81e00cb146da2531edb7` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 2 | response_headers / error | None / None | true | 0 | — | 469 | 0 / None | — | ECONNRESET |

### Case 2

- Job ID: `d80b0d731fb900dec6b25fecb569afa51979e5f3e669815d7a8d729b1824b8bd`; event ID: `4dacb389-8465-4c01-b95c-d32657d1afc7`.
- Thời điểm: **30/10/2026 00:58:56.709 ICT**; mức `request_error`; retry đã ghi: `5`.
- Source: [https://www.threads.com/@almirahae](https://www.threads.com/@almirahae).
- Request route: `https://www.threads.com/api/graphql`.
- elapsedMs=288; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `494b6bd8a59601c5d60882de51c875b491ad5b7af827c0a51a2a59c2dfad3460` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 2 | response_headers / error | None / None | true | 0 | — | 288 | 0 / None | — | ECONNRESET |

## G100 — instagram-source / UPSTREAM_TIMEOUT

`UPSTREAM_TIMEOUT__UNOBSERVED__SOURCE`

Group key: `1c250e169dcab456cf29359e7303c5cc8e5b3ebe18c8ce154fc70dfbd07f902a`. Lần đầu 30/10/2026 01:00:18.923; lần cuối 30/10/2026 03:49:05.796.

**Số ghi nhận riêng từng mức:** RQ=0; RT=6; RF=0; JF=0. Tổng bản ghi quan sát=6.

**Quan sát:** Hết thời gian của lượt đọc, nhưng không có networkTimings để định vị đến DNS/CONNECT/TLS/header/body.

**Chưa biết/giới hạn:** UPSTREAM_TIMEOUT là mã tổng hợp của ứng dụng; không phải bằng chứng native ETIMEDOUT. Không có elapsedMs ở các case này.

**Hướng xử lý:** Bổ sung trace trước acquisition/permit/request và giữ timing khi dispose/timeout. Giữ nhóm UNOBSERVED riêng; dùng job ID/cursor của case để tái hiện, không gán nguyên nhân cho proxy.

| Thuộc tính | Giá trị |
|---|---|
| platform | `instagram` |
| phase | `unobserved` |
| originalReason | `UPSTREAM_TIMEOUT` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `—` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `5c61fa02367e57f6a0882f2914e80499e99bd2168f8f921df7c341ad64a7c60b`; event ID: `991f4794-7b29-40ce-9591-1f65da9ce9f8`.
- Thời điểm: **30/10/2026 01:00:18.923 ICT**; mức `read_retry`; retry đã ghi: `5`.
- Source: [https://www.instagram.com/lifeatvinamilk/](https://www.instagram.com/lifeatvinamilk/).
- Request route: `—`.
- elapsedMs=—; wireBytes=—; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `c4c496517ce8743ec78b17cde82ddaabe81613fdcdc6840d7f2346964decac75` (không phải địa chỉ/credential proxy).

Không có wire timing trong case này; không suy đoán DNS/TCP/TLS/HTTP stage từ elapsed bị thiếu.

### Case 2

- Job ID: `d3db77707f406152817097056be8cbb8db6ce46b0329036c54b50496c9de6f43`; event ID: `eee53269-10a9-47f3-9077-1aa60389aa12`.
- Thời điểm: **30/10/2026 02:12:56.157 ICT**; mức `read_retry`; retry đã ghi: `56`.
- Source: [https://www.instagram.com/dpidamu/](https://www.instagram.com/dpidamu/).
- Request route: `—`.
- elapsedMs=—; wireBytes=—; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `d315f663ead47476675cf7808b99870727ed7b681348e9e8f1d79de0860408e9` (không phải địa chỉ/credential proxy).

Không có wire timing trong case này; không suy đoán DNS/TCP/TLS/HTTP stage từ elapsed bị thiếu.

## G101 — youtube-source / PROXY_MANAGER_UNAVAILABLE

`PROXY_MANAGER_UNAVAILABLE__PROXY_ASSIGNMENT__SOURCE`

Group key: `8c437d23ddcf046ff262a5a71dfa3eae3bba2ca830ca816ba6a6c197e2b4562a`. Lần đầu 30/10/2026 01:00:25.071; lần cuối 30/10/2026 03:43:46.125.

**Số ghi nhận riêng từng mức:** RQ=0; RT=5; RF=0; JF=0. Tổng bản ghi quan sát=5.

**Quan sát:** Client không hoàn tất thao tác xin proxy/lease với proxy manager.

**Chưa biết/giới hạn:** Chưa lưu status/cause/endpoint manager cụ thể; không đủ kết luận toàn bộ proxy manager down hay IP upstream lỗi.

**Hướng xử lý:** Ghi riêng manager acquisition/heartbeat/permit/report/release, status và cause gốc. Đối chiếu log manager đúng thời điểm case; không cộng vào reset TLS của platform.

| Thuộc tính | Giá trị |
|---|---|
| platform | `youtube` |
| phase | `proxy_assignment` |
| originalReason | `PROXY_MANAGER_UNAVAILABLE` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `—` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `a75f850dc0b65f492420fc2ac7909cc7f1a130d2dcd1825469a19ac904897fc5`; event ID: `c3c4c6b2-dd71-4169-9bea-6507d1f131ed`.
- Thời điểm: **30/10/2026 01:00:25.071 ICT**; mức `read_retry`; retry đã ghi: `2`.
- Source: [https://www.youtube.com/channel/UCIg56SgvoZF8Qg0Jx_gh6Pg](https://www.youtube.com/channel/UCIg56SgvoZF8Qg0Jx_gh6Pg).
- Request route: `—`.
- elapsedMs=—; wireBytes=—; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `557cf52f500673806ebb8efe0e9ad23be5f2f40f43db5b409bc2042024a85cd7` (không phải địa chỉ/credential proxy).
- Checkpoint/coverage giữ lại: `{"proxyRetries": 100, "coverage": {"recoveries": 0, "scope": "anonymous_public_response", "exhausted": false, "complete": false, "observedUnique": 30}, "pagination": {"hasMore": true, "complete": false, "reason": "HTTP_PAGE_BUDGET"}}`. Đây là observed coverage, chưa phải xác nhận ES lưu tất cả item.

Không có wire timing trong case này; không suy đoán DNS/TCP/TLS/HTTP stage từ elapsed bị thiếu.

### Case 2

- Job ID: `378d68df90e88e246888b826fad5d0568cc064659b3b2c1b26c65264f8ee3aa7`; event ID: `fc19181c-c2bb-4f08-9eee-fcb072629170`.
- Thời điểm: **30/10/2026 01:45:53.981 ICT**; mức `read_retry`; retry đã ghi: `3`.
- Source: [https://www.youtube.com/channel/UCKcxoGpxOJx3nt83MCG-nuQ](https://www.youtube.com/channel/UCKcxoGpxOJx3nt83MCG-nuQ).
- Request route: `—`.
- elapsedMs=—; wireBytes=—; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `dbb1e32e5f920e42d798bde24ffe5887247477b26e901f623f2c9357b46789eb` (không phải địa chỉ/credential proxy).

Không có wire timing trong case này; không suy đoán DNS/TCP/TLS/HTTP stage từ elapsed bị thiếu.

## G102 — youtube-comment / PUBLIC_ITEMS_NOT_RETURNED

`PUBLIC_ITEMS_NOT_RETURNED__HTTP_RESPONSE__HTTP_200__BR__COMMENTS`

Group key: `3280e958b9edbf740de2a7d60b4d910490e97ffa4ec468cbe923a8ba1d5cfa19`. Lần đầu 30/10/2026 01:01:04.528; lần cuối 30/10/2026 03:05:53.501.

**Số ghi nhận riêng từng mức:** RQ=0; RT=0; RF=5; JF=0. Tổng bản ghi quan sát=5.

**Quan sát:** Reader không nhận được các item công khai mong đợi tại operation comments dù HTTP 200; job kết thúc theo policy.

**Chưa biết/giới hạn:** Có thể là không có dữ liệu trong phạm vi đọc, gate, cấu trúc khác hoặc thiếu item; telemetry hiện tại chưa chứng minh riêng nguyên nhân nào.

**Hướng xử lý:** Đối chiếu native end/empty proof, identity, publication window và container item trong case. Không coi HTTP 200 hay việc job completed là bằng chứng crawl đủ.

| Thuộc tính | Giá trị |
|---|---|
| platform | `youtube` |
| phase | `http_response` |
| originalReason | `PUBLIC_ITEMS_NOT_RETURNED` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `200` |
| apiCode | `—` |
| operation | `comments` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `br` |
| wireComplete | `true` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `71c9527921bfce2114deca10b44f2e4e0b50a698424c17ffb3e62f6c32f56baf`; event ID: `aa4f380c-ac7a-4c83-8ec2-816dcdd22be8`.
- Thời điểm: **30/10/2026 01:01:04.528 ICT**; mức `read_failure`; retry đã ghi: `2`.
- Source: [https://www.youtube.com/channel/UCvJ8leyn7YWgqmbmw1R5ZVg](https://www.youtube.com/channel/UCvJ8leyn7YWgqmbmw1R5ZVg).
- Post: [https://www.youtube.com/watch?v=QpoOD44ON0Q](https://www.youtube.com/watch?v=QpoOD44ON0Q).
- Request route: `—`.
- elapsedMs=1855; wireBytes=962; decodedBytes=2260; wireComplete=true.
- Proxy endpoint hash: `2becb4985e92d60fe4ef9e97d04f2f9c303e486e180844eaab3f716aae6f9533` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 6 | complete / complete | 200 / None | true | 1 | 1517 | 1855 | 962 / 2260 | true | — |

### Case 2

- Job ID: `d34e5d15ad242b703a18bf433e4d8e681bb4c9caac2c10c2bc0a26a6be5e0029`; event ID: `405a2991-9dea-43f8-9744-3f20c42456d7`.
- Thời điểm: **30/10/2026 02:02:37.812 ICT**; mức `read_failure`; retry đã ghi: `1`.
- Source: [https://www.youtube.com/channel/UCIg56SgvoZF8Qg0Jx_gh6Pg](https://www.youtube.com/channel/UCIg56SgvoZF8Qg0Jx_gh6Pg).
- Post: [https://www.youtube.com/watch?v=5sE0VK3iovw](https://www.youtube.com/watch?v=5sE0VK3iovw).
- Request route: `—`.
- elapsedMs=4344; wireBytes=18805; decodedBytes=212527; wireComplete=true.
- Proxy endpoint hash: `5cb681fe5ea3b2dea979e749d2e004dfe18a2bee66e973e220e95d431b0514df` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 200 / 200 | false | 1650 | 2207 | 25890 | 133319 / 1366038 | true | — |
| 2 | complete / complete | 200 / None | true | 1 | 1043 | 4344 | 18805 / 212527 | true | — |

## G103 — instagram-source / PUBLIC_ITEMS_NOT_RETURNED

`PUBLIC_ITEMS_NOT_RETURNED__HTTP_RESPONSE__HTTP_200__BR__SOURCE`

Group key: `5d47576491bf0aa65155462f85ef250e908c705895877abe3cb1fd19244a8149`. Lần đầu 30/10/2026 01:16:24.676; lần cuối 30/10/2026 02:46:30.372.

**Số ghi nhận riêng từng mức:** RQ=0; RT=0; RF=5; JF=0. Tổng bản ghi quan sát=5.

**Quan sát:** Reader không nhận được các item công khai mong đợi tại operation source dù HTTP 200; job kết thúc theo policy.

**Chưa biết/giới hạn:** Có thể là không có dữ liệu trong phạm vi đọc, gate, cấu trúc khác hoặc thiếu item; telemetry hiện tại chưa chứng minh riêng nguyên nhân nào.

**Hướng xử lý:** Đối chiếu native end/empty proof, identity, publication window và container item trong case. Không coi HTTP 200 hay việc job completed là bằng chứng crawl đủ.

| Thuộc tính | Giá trị |
|---|---|
| platform | `instagram` |
| phase | `http_response` |
| originalReason | `PUBLIC_ITEMS_NOT_RETURNED` |
| nativeCode | `—` |
| connectStatus | `200` |
| httpStatus | `200` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `br` |
| wireComplete | `true` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `b9f49d51614eb7622808ab3c6134820e93a0793ac3eba5199a17eccd6c323bed`; event ID: `6518a672-1e76-429d-b7a0-4db189986f1f`.
- Thời điểm: **30/10/2026 01:16:24.676 ICT**; mức `read_failure`; retry đã ghi: `0`.
- Source: [https://www.instagram.com/samsungvietnam/](https://www.instagram.com/samsungvietnam/).
- Request route: `—`.
- elapsedMs=19487; wireBytes=114126; decodedBytes=713427; wireComplete=true.
- Proxy endpoint hash: `e6f397cb2ff59e4087b3932cfac8e3a813a0df748eb91ebf76ae58e6e0c59d71` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 200 / 200 | false | 1536 | 2813 | 19487 | 114126 / 713427 | true | — |

### Case 2

- Job ID: `0701f0dc8a8ae984f0ae790fb7a6e560d2158444c9f0180a8a9ff1ae98e220f6`; event ID: `100324a3-ab60-432e-a53a-8715a323bdaa`.
- Thời điểm: **30/10/2026 01:22:57.789 ICT**; mức `read_failure`; retry đã ghi: `4`.
- Source: [https://www.instagram.com/ibiero.craftbeer/](https://www.instagram.com/ibiero.craftbeer/).
- Request route: `—`.
- elapsedMs=16903; wireBytes=112365; decodedBytes=705970; wireComplete=true.
- Proxy endpoint hash: `01a01fd0e59c6a8b21005bfea6b6b918dde95729dadb2b3e9f73a7202e51cbc2` (không phải địa chỉ/credential proxy).
- Auth evidence: `{"classification": "source_restriction", "confirmed": true, "stage": "initial", "evidence": "explicit_age_restriction"}`.

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 200 / 200 | false | 2496 | 3253 | 16903 | 112365 / 705970 | true | — |

## G104 — facebook-page-source / PROXY_MANAGER_UNAVAILABLE

`PROXY_MANAGER_UNAVAILABLE__PROXY_ASSIGNMENT__SOURCE`

Group key: `f85b5900aeab9873cd6fffad54efdef7f122185634249a8a271aad321bdfacea`. Lần đầu 30/10/2026 00:50:23.186; lần cuối 30/10/2026 03:43:02.124.

**Số ghi nhận riêng từng mức:** RQ=0; RT=5; RF=0; JF=0. Tổng bản ghi quan sát=5.

**Quan sát:** Client không hoàn tất thao tác xin proxy/lease với proxy manager.

**Chưa biết/giới hạn:** Chưa lưu status/cause/endpoint manager cụ thể; không đủ kết luận toàn bộ proxy manager down hay IP upstream lỗi.

**Hướng xử lý:** Ghi riêng manager acquisition/heartbeat/permit/report/release, status và cause gốc. Đối chiếu log manager đúng thời điểm case; không cộng vào reset TLS của platform.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `proxy_assignment` |
| originalReason | `PROXY_MANAGER_UNAVAILABLE` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `—` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `2955706889a506918f1ea85be0a63f970608b863d2ef11d734e720f55ee7c3c2`; event ID: `5e2e3683-f5e7-437e-bb75-3c22477b3fb4`.
- Thời điểm: **30/10/2026 00:53:19.137 ICT**; mức `read_retry`; retry đã ghi: `1`.
- Source: [https://www.facebook.com/326218537406137](https://www.facebook.com/326218537406137).
- Request route: `—`.
- elapsedMs=—; wireBytes=—; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `b4aa5e353b18d757dec0bd61df049797b4ae99dd1254a9dc4a5bd4cca7f476e0` (không phải địa chỉ/credential proxy).

Không có wire timing trong case này; không suy đoán DNS/TCP/TLS/HTTP stage từ elapsed bị thiếu.

### Case 2

- Job ID: `13c660638bd0025e58d37a4c43577111c89f76303001c90a7a530d9648c9168f`; event ID: `c9138947-ccbb-4141-9ea9-6bf704164ff4`.
- Thời điểm: **30/10/2026 03:40:12.836 ICT**; mức `read_retry`; retry đã ghi: `4`.
- Source: [https://www.facebook.com/185866234914652](https://www.facebook.com/185866234914652).
- Request route: `—`.
- elapsedMs=—; wireBytes=—; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `1eb70dfc8882a9198e1c886a51c67c18f567b20bbf8898d43dc6268e72eb9df1` (không phải địa chỉ/credential proxy).

Không có wire timing trong case này; không suy đoán DNS/TCP/TLS/HTTP stage từ elapsed bị thiếu.

## G105 — facebook-group-source / FACEBOOK_RATE_LIMITED

`FACEBOOK_RATE_LIMITED__HTTP_RESPONSE__HTTP_200__BR__SOURCE`

Group key: `3c5d191b4d535d7452ec6e39e0c2e4968a6b9c92789ae64f78f758ac92278578`. Lần đầu 30/10/2026 01:05:15.843; lần cuối 30/10/2026 02:33:24.761.

**Số ghi nhận riêng từng mức:** RQ=0; RT=5; RF=0; JF=0. Tổng bản ghi quan sát=5.

**Quan sát:** Reader Facebook source phân loại rate limit trong HTTP 200, nhưng native API code không được giữ ở biến thể này.

**Chưa biết/giới hạn:** Không đủ thông tin để nói nó trùng API 1675004 của comment; cần giữ riêng nhóm apiCode chưa ghi.

**Hướng xử lý:** Giữ error.code/subcode và dấu hiệu thông báo đã khử bí mật từ source adapter; đối chiếu request shape và hạn mức source.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `http_response` |
| originalReason | `FACEBOOK_RATE_LIMITED` |
| nativeCode | `—` |
| connectStatus | `200` |
| httpStatus | `200` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `br` |
| wireComplete | `true` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `37517f748c4d87bc71537d93fbcb9d9d6ef7b6c9f10ac64aa4b3e20492a2db3f`; event ID: `a1f592e6-8bf2-493a-ba8a-f49c1a277739`.
- Thời điểm: **30/10/2026 01:05:15.843 ICT**; mức `read_retry`; retry đã ghi: `4`.
- Source: [https://www.facebook.com/groups/196926359898300](https://www.facebook.com/groups/196926359898300).
- Request route: `—`.
- elapsedMs=4228; wireBytes=104; decodedBytes=114; wireComplete=true.
- Proxy endpoint hash: `632b7efa8c7957d1bc73e54ed16afbe3ab31063beb563ee539c83a3329320f45` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 200 / 200 | false | 2111 | 3569 | 30560 | 218983 / 1091028 | true | — |
| 2 | complete / complete | 200 / 200 | false | 2716 | 3458 | 4228 | 104 / 114 | true | — |

### Case 2

- Job ID: `64347e6b2b697cf88cecbc4ad18e2c5a945909631286109bef751361852bedb5`; event ID: `efb162df-288d-4770-bf0e-7f0235ee59b5`.
- Thời điểm: **30/10/2026 01:15:26.673 ICT**; mức `read_retry`; retry đã ghi: `4`.
- Source: [https://www.facebook.com/groups/207997893590557](https://www.facebook.com/groups/207997893590557).
- Request route: `—`.
- elapsedMs=4071; wireBytes=104; decodedBytes=114; wireComplete=true.
- Proxy endpoint hash: `6435ac2d8b512f971652983ba5bdded2f76be7ba79bdecea77c799dd8f0b900c` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 200 / 200 | false | 1421 | 2414 | 28804 | 227499 / 1113547 | true | — |
| 2 | complete / complete | 200 / 200 | false | 2543 | 3505 | 4071 | 104 / 114 | true | — |

## G106 — youtube-comment / PROXY_EXPIRED

`PROXY_EXPIRED__RESPONSE_BODY__PROXY_EXPIRED__HTTP_200__BR__WIRE_COMPLETE__COMMENTS`

Group key: `dffb3cc37bb83a9881e95e6a409a5fd9266be97c4ece203b982c701c83ab77e4`. Lần đầu 30/10/2026 01:26:24.293; lần cuối 30/10/2026 03:03:34.377.

**Số ghi nhận riêng từng mức:** RQ=2; RT=2; RF=0; JF=0. Tổng bản ghi quan sát=4.

**Quan sát:** Timer hết hạn lease/proxy khi xử lý response body. Trong 24 request_error của nhóm này, HTTP 200 và wireComplete=true: dữ liệu wire đã nhận đủ.

**Chưa biết/giới hạn:** Không phải bằng chứng socket bị reset hay proxy provider từ chối. decodedEndedMs chưa có ở các case kiểm tra; chưa phân biệt được drain/decode chậm hay TTL còn quá ít.

**Hướng xử lý:** Kiểm tra TTL còn lại trước request và ranh giới đóng lease với giải nén xong. Bảo toàn cursor, cân nhắc đổi lease trước khi bắt đầu request gần hết TTL; không gộp với Z_DATA_ERROR hay ECONNRESET.

| Thuộc tính | Giá trị |
|---|---|
| platform | `youtube` |
| phase | `response_body` |
| originalReason | `PROXY_EXPIRED` |
| nativeCode | `PROXY_EXPIRED` |
| connectStatus | `—` |
| httpStatus | `200` |
| apiCode | `—` |
| operation | `comments` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `br` |
| wireComplete | `true` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `dccda02b7ecb94bb60353e870fcdb86d902bfee702fba7315eb31e410c1fb675`; event ID: `f06748ad-81ae-43bf-ad20-467ac0d59b91`.
- Thời điểm: **30/10/2026 01:26:24.293 ICT**; mức `request_error`; retry đã ghi: `2`.
- Source: [https://www.youtube.com/channel/UCWwgaK7x0_FR1goeSRazfsQ](https://www.youtube.com/channel/UCWwgaK7x0_FR1goeSRazfsQ).
- Post: [https://www.youtube.com/watch?v=ZkJr4rj-zbI](https://www.youtube.com/watch?v=ZkJr4rj-zbI).
- Request route: `https://www.youtube.com/youtubei/v1/next`.
- elapsedMs=1651; wireBytes=14027; decodedBytes=191828; wireComplete=true.
- Proxy endpoint hash: `263a0fde12b0228de5c2ea4cc471ca2bf53d0da3f0a9bbbf3a98334add20ef69` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 6 | response_body / error | 200 / None | true | 0 | 726 | 1651 | 14027 / 191828 | true | PROXY_EXPIRED |

### Case 2

- Job ID: `31e071cef19a54b681d88dee8ebb24d65db7f84b33d2e3c764655fdc297d70d3`; event ID: `2f3088b1-a500-43a6-95e9-aedb81e02793`.
- Thời điểm: **30/10/2026 03:03:33.999 ICT**; mức `request_error`; retry đã ghi: `4`.
- Source: [https://www.youtube.com/channel/UCf2LomK7v6C9XOennDpMtGA](https://www.youtube.com/channel/UCf2LomK7v6C9XOennDpMtGA).
- Post: [https://www.youtube.com/watch?v=VOX9Alm5qYQ](https://www.youtube.com/watch?v=VOX9Alm5qYQ).
- Request route: `https://www.youtube.com/youtubei/v1/next`.
- elapsedMs=1840; wireBytes=4370; decodedBytes=36889; wireComplete=true.
- Proxy endpoint hash: `0a756cc5269ddfeca9187549e4546bd9c970856378e8dd1409becf11b3d9a818` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 16 | response_body / error | 200 / None | true | 1 | 1454 | 1840 | 4370 / 36889 | true | PROXY_EXPIRED |

## G107 — instagram-comment / PROXY_EXPIRED

`PROXY_EXPIRED__PROXY_HEARTBEAT__PROXY_EXPIRED__COMMENTS`

Group key: `1b7490862102d302f35933d7870862e65b371e1eea941b1f594b9b13987cb444`. Lần đầu 30/10/2026 01:40:04.179; lần cuối 30/10/2026 03:31:27.249.

**Số ghi nhận riêng từng mức:** RQ=0; RT=4; RF=0; JF=0. Tổng bản ghi quan sát=4.

**Quan sát:** Lease đã hết hạn khi kiểm tra heartbeat trước khi tiếp tục đọc; đây là vòng đời lease, không phải lỗi HTTP response.

**Chưa biết/giới hạn:** Không có bằng chứng target platform lỗi; thời điểm hết hạn không đo được từ body do chưa có request mới.

**Hướng xử lý:** Đối chiếu expiresAt/heartbeat và thay lease theo policy giữ cursor. Phân loại như sự kiện vòng đời cần theo dõi, tách khỏi sự cố mạng.

| Thuộc tính | Giá trị |
|---|---|
| platform | `instagram` |
| phase | `proxy_heartbeat` |
| originalReason | `PROXY_EXPIRED` |
| nativeCode | `PROXY_EXPIRED` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `comments` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `—` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `8e670333232ef8951768ec8cdf158481590c986eea92bb5fe355dcf8477770e8`; event ID: `f549aaa2-5536-4b48-ad4f-7a68f0eabd94`.
- Thời điểm: **30/10/2026 01:40:04.179 ICT**; mức `read_retry`; retry đã ghi: `16`.
- Source: [https://www.instagram.com/misscosmointernational/](https://www.instagram.com/misscosmointernational/).
- Post: [https://www.instagram.com/p/De9OrY7RrmP/](https://www.instagram.com/p/De9OrY7RrmP/).
- Request route: `—`.
- elapsedMs=—; wireBytes=—; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `b8e31946f60323d860e53d5c3556ae3d5dc55f8088a58e362d4008a54a8dbc90` (không phải địa chỉ/credential proxy).

Không có wire timing trong case này; không suy đoán DNS/TCP/TLS/HTTP stage từ elapsed bị thiếu.

### Case 2

- Job ID: `6cb264a53413b97798283531746f35356c0521359a0d19149fb7dc07c952e4a8`; event ID: `26f6cfd9-379c-415d-9396-0ef2c09d28a0`.
- Thời điểm: **30/10/2026 03:31:27.249 ICT**; mức `read_retry`; retry đã ghi: `1`.
- Source: [https://www.instagram.com/yolinalindquist/](https://www.instagram.com/yolinalindquist/).
- Post: [https://www.instagram.com/p/DfEljYylcZ7/](https://www.instagram.com/p/DfEljYylcZ7/).
- Request route: `—`.
- elapsedMs=—; wireBytes=—; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `2becb4985e92d60fe4ef9e97d04f2f9c303e486e180844eaab3f716aae6f9533` (không phải địa chỉ/credential proxy).

Không có wire timing trong case này; không suy đoán DNS/TCP/TLS/HTTP stage từ elapsed bị thiếu.

## G108 — facebook-comment / PROXY_MANAGER_UNAVAILABLE

`PROXY_MANAGER_UNAVAILABLE__PROXY_ASSIGNMENT__COMMENTS__COMMENTSLISTCOMPONENTSPAGINATIONQUERY`

Group key: `9ac9b41bd847ec7965b8009c5636e6982e7221115f7ed277af9aab4d0f93b4a3`. Lần đầu 30/10/2026 00:54:32.125; lần cuối 30/10/2026 00:54:32.172.

**Số ghi nhận riêng từng mức:** RQ=0; RT=3; RF=0; JF=0. Tổng bản ghi quan sát=3.

**Quan sát:** Client không hoàn tất thao tác xin proxy/lease với proxy manager.

**Chưa biết/giới hạn:** Chưa lưu status/cause/endpoint manager cụ thể; không đủ kết luận toàn bộ proxy manager down hay IP upstream lỗi.

**Hướng xử lý:** Ghi riêng manager acquisition/heartbeat/permit/report/release, status và cause gốc. Đối chiếu log manager đúng thời điểm case; không cộng vào reset TLS của platform.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `proxy_assignment` |
| originalReason | `PROXY_MANAGER_UNAVAILABLE` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `comments` |
| query | `CommentsListComponentsPaginationQuery` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `—` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `b48573b8c0580d253cc57e9e7b1e10dfd14bda21a416e06e6c4b2ed5a335729e`; event ID: `e2d8eee9-f619-42c1-9da2-1b942d57c6ab`.
- Thời điểm: **30/10/2026 00:54:32.125 ICT**; mức `read_retry`; retry đã ghi: `1`.
- Source: [https://www.facebook.com/groups/1001052570569902](https://www.facebook.com/groups/1001052570569902).
- Post: [https://www.facebook.com/1001052570569902_2013197062688776](https://www.facebook.com/1001052570569902_2013197062688776).
- Request route: `—`.
- elapsedMs=—; wireBytes=—; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `494b6bd8a59601c5d60882de51c875b491ad5b7af827c0a51a2a59c2dfad3460` (không phải địa chỉ/credential proxy).

Không có wire timing trong case này; không suy đoán DNS/TCP/TLS/HTTP stage từ elapsed bị thiếu.

### Case 2

- Job ID: `8aa4df4ed92755d8228aaf1275b1d049515823ea3079962ea46a618252f42518`; event ID: `9c82c7b2-8bf1-47d9-91e8-51d070641f7f`.
- Thời điểm: **30/10/2026 00:54:32.167 ICT**; mức `read_retry`; retry đã ghi: `1`.
- Source: [https://www.facebook.com/groups/1023069638660550](https://www.facebook.com/groups/1023069638660550).
- Post: [https://www.facebook.com/1023069638660550_1657382585229249](https://www.facebook.com/1023069638660550_1657382585229249).
- Request route: `—`.
- elapsedMs=—; wireBytes=—; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `7d730d63405f07f751675db935187f1ecab6b7f2cf0c336fd977304ca6d2c70e` (không phải địa chỉ/credential proxy).

Không có wire timing trong case này; không suy đoán DNS/TCP/TLS/HTTP stage từ elapsed bị thiếu.

## G109 — youtube-source / PROXY_EXPIRED

`PROXY_EXPIRED__PROXY_HEARTBEAT__PROXY_EXPIRED__SOURCE`

Group key: `56345a7653b2a52a9ac8c2ca9e31b744f38abf747be9ea0a0265a661030e6978`. Lần đầu 30/10/2026 01:26:24.295; lần cuối 30/10/2026 03:31:23.836.

**Số ghi nhận riêng từng mức:** RQ=0; RT=3; RF=0; JF=0. Tổng bản ghi quan sát=3.

**Quan sát:** Lease đã hết hạn khi kiểm tra heartbeat trước khi tiếp tục đọc; đây là vòng đời lease, không phải lỗi HTTP response.

**Chưa biết/giới hạn:** Không có bằng chứng target platform lỗi; thời điểm hết hạn không đo được từ body do chưa có request mới.

**Hướng xử lý:** Đối chiếu expiresAt/heartbeat và thay lease theo policy giữ cursor. Phân loại như sự kiện vòng đời cần theo dõi, tách khỏi sự cố mạng.

| Thuộc tính | Giá trị |
|---|---|
| platform | `youtube` |
| phase | `proxy_heartbeat` |
| originalReason | `PROXY_EXPIRED` |
| nativeCode | `PROXY_EXPIRED` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `—` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `03b772e0bc0d89cae589e46c376dce4bff2b985d71d47a37cba07b5fd6f455fc`; event ID: `18d9b48d-9341-4421-8837-dba7e2e0d24e`.
- Thời điểm: **30/10/2026 01:26:24.295 ICT**; mức `read_retry`; retry đã ghi: `18`.
- Source: [https://www.youtube.com/channel/UCJY-ezq7saVb3CdfkfnoqNA](https://www.youtube.com/channel/UCJY-ezq7saVb3CdfkfnoqNA).
- Request route: `—`.
- elapsedMs=—; wireBytes=—; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `263a0fde12b0228de5c2ea4cc471ca2bf53d0da3f0a9bbbf3a98334add20ef69` (không phải địa chỉ/credential proxy).

Không có wire timing trong case này; không suy đoán DNS/TCP/TLS/HTTP stage từ elapsed bị thiếu.

### Case 2

- Job ID: `cb4085decbb006f464649c9b07f9323df195d0e9fbe9654e3dc56ceac6acecc8`; event ID: `49ec6746-fc44-44c2-82dc-caf793b606b7`.
- Thời điểm: **30/10/2026 03:01:57.216 ICT**; mức `read_retry`; retry đã ghi: `16`.
- Source: [https://www.youtube.com/channel/UCPJfjHrW3-zIeSaZTgmckmg](https://www.youtube.com/channel/UCPJfjHrW3-zIeSaZTgmckmg).
- Request route: `—`.
- elapsedMs=—; wireBytes=—; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `2becb4985e92d60fe4ef9e97d04f2f9c303e486e180844eaab3f716aae6f9533` (không phải địa chỉ/credential proxy).

Không có wire timing trong case này; không suy đoán DNS/TCP/TLS/HTTP stage từ elapsed bị thiếu.

## G110 — facebook-page-source / PROXY_EXPIRED

`PROXY_EXPIRED__UNOBSERVED__SOURCE`

Group key: `ecfd2e2262fbfe32be1c5c2a9d0882076f905f3a64d01f190acca5b86815336c`. Lần đầu 30/10/2026 01:19:40.281; lần cuối 30/10/2026 02:27:21.818.

**Số ghi nhận riêng từng mức:** RQ=0; RT=3; RF=0; JF=0. Tổng bản ghi quan sát=3.

**Quan sát:** Reader hoặc transport báo lease/proxy hết hạn, nhưng phase hiện tại chưa định vị thêm được.

**Chưa biết/giới hạn:** Thiếu mốc expiresAt và bước con nên chưa xác nhận nó hết hạn trước hay sau request.

**Hướng xử lý:** Ghi TTL và lifecycle stage vào event, giữ nguyên phân loại chưa xác định thay vì đoán lỗi socket.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `unobserved` |
| originalReason | `PROXY_EXPIRED` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `—` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `3199154176c575e3a73e189f12a2b4e4ac368fc64e12197d1e97795f0d96afa2`; event ID: `d374b613-0f80-4136-83a2-8cf98e894613`.
- Thời điểm: **30/10/2026 01:19:40.281 ICT**; mức `read_retry`; retry đã ghi: `1`.
- Source: [https://www.facebook.com/609107658958174](https://www.facebook.com/609107658958174).
- Request route: `—`.
- elapsedMs=—; wireBytes=—; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `e6f397cb2ff59e4087b3932cfac8e3a813a0df748eb91ebf76ae58e6e0c59d71` (không phải địa chỉ/credential proxy).

Không có wire timing trong case này; không suy đoán DNS/TCP/TLS/HTTP stage từ elapsed bị thiếu.

### Case 2

- Job ID: `c4a7da25dd2eedbe24bbdd8cb132fca752e93c7f013625b0dfe74c4601d12611`; event ID: `1a8841e4-1cd2-405b-af31-db12cdc98baf`.
- Thời điểm: **30/10/2026 01:29:57.220 ICT**; mức `read_retry`; retry đã ghi: `4`.
- Source: [https://www.facebook.com/631658256990905](https://www.facebook.com/631658256990905).
- Request route: `—`.
- elapsedMs=—; wireBytes=—; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `5cb681fe5ea3b2dea979e749d2e004dfe18a2bee66e973e220e95d431b0514df` (không phải địa chỉ/credential proxy).

Không có wire timing trong case này; không suy đoán DNS/TCP/TLS/HTTP stage từ elapsed bị thiếu.

## G111 — facebook-group-source / PROXY_EXPIRED

`PROXY_EXPIRED__UNOBSERVED__SOURCE`

Group key: `3acf5c73995fcefd221ed8c9a7c574f1b1f7825bcb4df672b7cbd2b38f49326a`. Lần đầu 30/10/2026 01:21:28.939; lần cuối 30/10/2026 03:14:34.409.

**Số ghi nhận riêng từng mức:** RQ=0; RT=3; RF=0; JF=0. Tổng bản ghi quan sát=3.

**Quan sát:** Reader hoặc transport báo lease/proxy hết hạn, nhưng phase hiện tại chưa định vị thêm được.

**Chưa biết/giới hạn:** Thiếu mốc expiresAt và bước con nên chưa xác nhận nó hết hạn trước hay sau request.

**Hướng xử lý:** Ghi TTL và lifecycle stage vào event, giữ nguyên phân loại chưa xác định thay vì đoán lỗi socket.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `unobserved` |
| originalReason | `PROXY_EXPIRED` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `—` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `affcd862a84188f105171b3c6509a51402371cb9f4d86ae09893081f27048b39`; event ID: `386e1fe8-8b0c-4ea5-8bd1-8ba37d8ed563`.
- Thời điểm: **30/10/2026 01:21:29.125 ICT**; mức `read_retry`; retry đã ghi: `2`.
- Source: [https://www.facebook.com/groups/2160188260902273](https://www.facebook.com/groups/2160188260902273).
- Request route: `—`.
- elapsedMs=—; wireBytes=—; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `42ee874e1acc169f4ce44a74c10bb52659d42b7761bb8049c8ce8ef8e926f544` (không phải địa chỉ/credential proxy).

Không có wire timing trong case này; không suy đoán DNS/TCP/TLS/HTTP stage từ elapsed bị thiếu.

### Case 2

- Job ID: `0f293fdad5eb4c91e3402ea178ee8eab9d816bf11ef82a064a95aee7ade2fc42`; event ID: `168c3785-8f2b-41ea-beda-184b31897f8c`.
- Thời điểm: **30/10/2026 03:14:34.409 ICT**; mức `read_retry`; retry đã ghi: `10`.
- Source: [https://www.facebook.com/groups/414574513849319](https://www.facebook.com/groups/414574513849319).
- Request route: `—`.
- elapsedMs=—; wireBytes=—; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `1fbeb8474d73a6439b60037b69c1195e87ff741c1426c79cf23224b16b7f2c58` (không phải địa chỉ/credential proxy).

Không có wire timing trong case này; không suy đoán DNS/TCP/TLS/HTTP stage từ elapsed bị thiếu.

## G112 — youtube-comment / PROXY_EXPIRED

`PROXY_EXPIRED__PROXY_TLS__PROXY_EXPIRED__COMMENTS`

Group key: `4dfbf28139188781e6696002d886d9896412b9fc74c4e2432ecae7aaae8791f4`. Lần đầu 30/10/2026 01:30:36.117; lần cuối 30/10/2026 01:30:36.170.

**Số ghi nhận riêng từng mức:** RQ=1; RT=1; RF=0; JF=0. Tổng bản ghi quan sát=2.

**Quan sát:** Lease/proxy chạm hạn khi còn ở bước TLS qua tunnel; event có elapsedMs và chưa có HTTP response.

**Chưa biết/giới hạn:** Khác với native reset TLS; mã này do timer/TTL của ứng dụng, không chứng minh peer chủ động cắt kết nối.

**Hướng xử lý:** Kiểm tra TTL trước CONNECT/TLS và lifecycle release, giữ riêng khỏi nhóm TLS ECONNRESET.

| Thuộc tính | Giá trị |
|---|---|
| platform | `youtube` |
| phase | `proxy_tls` |
| originalReason | `PROXY_EXPIRED` |
| nativeCode | `PROXY_EXPIRED` |
| connectStatus | `200` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `comments` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

Chỉ có **1 job thật** trong nhóm; không bịa case thứ hai.

### Case 1

- Job ID: `d8fcafc2f60294d9957098950d2a3625912f6f76f9c98de213a6eba716790ebb`; event ID: `fb96a480-1012-458e-afaa-071f547c4cc0`.
- Thời điểm: **30/10/2026 01:30:36.117 ICT**; mức `request_error`; retry đã ghi: `3`.
- Source: [https://www.youtube.com/channel/UC3O-gNkOsgemkuhuAopEGbA](https://www.youtube.com/channel/UC3O-gNkOsgemkuhuAopEGbA).
- Post: [https://www.youtube.com/watch?v=GgOgjSlL4Pc](https://www.youtube.com/watch?v=GgOgjSlL4Pc).
- Request route: `https://www.youtube.com/youtubei/v1/next`.
- elapsedMs=2006; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `12fe8772934faddcc1651da315d774a0be9a423fe040d631ab848bf4531f0964` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 8 | proxy_tls / error | None / 200 | false | — | — | 2006 | 0 / None | — | PROXY_EXPIRED |

## G113 — instagram-source / UPSTREAM_HTTP_429

`UPSTREAM_HTTP_429__HTTP_RESPONSE__HTTP_429__SOURCE`

Group key: `0a76dbffb620749426b684623b19e8de76d7d28980466520ac983962de3b9ed0`. Lần đầu 30/10/2026 00:47:35.492; lần cuối 30/10/2026 00:47:36.065.

**Số ghi nhận riêng từng mức:** RQ=1; RT=1; RF=0; JF=0. Tổng bản ghi quan sát=2.

**Quan sát:** Platform request trả HTTP 429; body được chủ động bỏ đọc để nhả tài nguyên nhanh. Đây không phải proxy CONNECT 429.

**Chưa biết/giới hạn:** wireComplete=false ở các case này không chứng minh lỗi truyền body: code cố ý dừng body của 429. Chưa có bằng chứng lỗi giới hạn theo một IP cụ thể.

**Hướng xử lý:** Đối chiếu Retry-After và giới hạn theo platform/operation; xem lại việc xoay proxy lặp liên tục với policy hiện tại. Không quarantine proxy chỉ từ origin HTTP 429.

| Thuộc tính | Giá trị |
|---|---|
| platform | `instagram` |
| phase | `http_response` |
| originalReason | `UPSTREAM_HTTP_429` |
| nativeCode | `—` |
| connectStatus | `200` |
| httpStatus | `429` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `false` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

Chỉ có **1 job thật** trong nhóm; không bịa case thứ hai.

### Case 1

- Job ID: `261854fc74842ee30337a0d28f800a0987f8aa2672dd4a0a13ec0ed898e1bc4d`; event ID: `921dfc90-f7e8-4c12-8909-a361658aecd4`.
- Thời điểm: **30/10/2026 00:47:35.492 ICT**; mức `request_error`; retry đã ghi: `4`.
- Source: [https://www.instagram.com/dragonhotpot_vn/](https://www.instagram.com/dragonhotpot_vn/).
- Request route: `—`.
- elapsedMs=2675; wireBytes=0; decodedBytes=—; wireComplete=false.
- Proxy endpoint hash: `95596101280f3fe35027a8c45359a828b7ef8262f3814efbf3d4224be8e7ecb4` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 4 | complete / complete | 429 / 200 | false | 1844 | 2675 | 2675 | 0 / None | false | — |

## G114 — facebook-user-source / NETWORK_ERROR

`NETWORK_ERROR__RESPONSE_BODY__ECONNRESET__HTTP_200__BR__WIRE_INCOMPLETE__SOURCE`

Group key: `d0ca3df868e240197be3c2f32ef40326d201e2c274b5d9047a210aa63faad974`. Lần đầu 30/10/2026 01:14:27.641; lần cuối 30/10/2026 01:15:26.743.

**Số ghi nhận riêng từng mức:** RQ=0; RT=2; RF=0; JF=0. Tổng bản ghi quan sát=2.

**Quan sát:** Đã có HTTP 200 và nhận được một phần bytes, sau đó reset; wireComplete=false cho thấy body chưa được xác nhận đủ.

**Chưa biết/giới hạn:** Không phải reset CONNECT/TLS. Content-Encoding br không đồng nghĩa lỗi giải nén: không có native Z_DATA_ERROR/Brotli decode error.

**Hướng xử lý:** Đối chiếu responseAborted, byte counts và route; không parse body thiếu thành dữ liệu hoàn chỉnh. Thử lại cùng request shape có kiểm soát và giữ cursor.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `response_body` |
| originalReason | `NETWORK_ERROR` |
| nativeCode | `ECONNRESET` |
| connectStatus | `—` |
| httpStatus | `200` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `br` |
| wireComplete | `false` |
| responseAborted | `true` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

Chỉ có **1 job thật** trong nhóm; không bịa case thứ hai.

### Case 1

- Job ID: `1e9371116436a560e2b744f96ba9a52b5ca3bdd9fb37331863cd5baa899890dd`; event ID: `ad51c265-35e5-439e-9724-fca00319862c`.
- Thời điểm: **30/10/2026 01:14:27.641 ICT**; mức `read_retry`; retry đã ghi: `1`.
- Source: [https://www.facebook.com/100003693044429](https://www.facebook.com/100003693044429).
- Request route: `https://www.facebook.com/api/graphql/`.
- elapsedMs=28387; wireBytes=60153; decodedBytes=293587; wireComplete=false.
- Proxy endpoint hash: `12fe8772934faddcc1651da315d774a0be9a423fe040d631ab848bf4531f0964` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 301 / 200 | false | 1561 | 2432 | 26257 | 0 / None | true | — |
| 2 | complete / complete | 200 / None | true | 0 | 972 | 23023 | 199611 / 1016434 | true | — |
| 3 | response_body / error | 200 / None | true | 0 | 3809 | 28387 | 60153 / 293587 | false | ECONNRESET |

## G115 — facebook-comment / NETWORK_ERROR

`NETWORK_ERROR__RESPONSE_HEADERS__ECONNRESET__COMMENTS__COMMENTSLISTCOMPONENTSPAGINATIONQUERY`

Group key: `9e8e88c21e412e2af36c10a1c03a688e02740a82387d0a71ab14473eece0f988`. Lần đầu 30/10/2026 00:55:12.553; lần cuối 30/10/2026 01:10:43.408.

**Số ghi nhận riêng từng mức:** RQ=0; RT=2; RF=0; JF=0. Tổng bản ghi quan sát=2.

**Quan sát:** Socket/TLS đã được cấp (nhiều case là socket tái sử dụng) nhưng bị reset trước khi có HTTP header.

**Chưa biết/giới hạn:** Chưa có HTTP status; không được gán thành lỗi TLS handshake hay lỗi nhận body. Có thể liên quan socket reuse, nhưng mẫu chưa chứng minh nguyên nhân.

**Hướng xử lý:** So sánh reusedSocket=true/false và vòng đời keep-alive cùng route; giữ riêng khỏi TLS và body, không tăng retry mù.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `response_headers` |
| originalReason | `NETWORK_ERROR` |
| nativeCode | `ECONNRESET` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `comments` |
| query | `CommentsListComponentsPaginationQuery` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `85fcdc0d7ed0caa3c67e37d6755725ee27281b4a0296eb95fbbef66b64d0528f`; event ID: `c9bb7d72-0d27-438c-9a0e-572f7b13c7af`.
- Thời điểm: **30/10/2026 00:55:12.553 ICT**; mức `read_retry`; retry đã ghi: `2`.
- Source: [https://www.facebook.com/groups/1023069638660550](https://www.facebook.com/groups/1023069638660550).
- Post: [https://www.facebook.com/1023069638660550_1657314125236095](https://www.facebook.com/1023069638660550_1657314125236095).
- Request route: `https://www.facebook.com/api/graphql/`.
- elapsedMs=246; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `1fbeb8474d73a6439b60037b69c1195e87ff741c1426c79cf23224b16b7f2c58` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 301 / 200 | false | 1819 | 2702 | 29036 | 0 / None | true | — |
| 2 | complete / complete | 200 / None | true | 1 | 1163 | 25876 | 137383 / 875427 | true | — |
| 3 | response_headers / error | None / None | true | 1 | — | 246 | 0 / None | — | ECONNRESET |

### Case 2

- Job ID: `e6f3d334dea8728c20459b21857f2ac7cb3767a14491a9b37ce2966df8af13f1`; event ID: `c00b6060-21f2-4185-a5c2-29962018fa3e`.
- Thời điểm: **30/10/2026 01:10:43.408 ICT**; mức `read_retry`; retry đã ghi: `1`.
- Source: [https://www.facebook.com/groups/1052037723261409](https://www.facebook.com/groups/1052037723261409).
- Post: [https://www.facebook.com/1052037723261409_1751848733280301](https://www.facebook.com/1052037723261409_1751848733280301).
- Request route: `https://www.facebook.com/api/graphql/`.
- elapsedMs=294; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `01a01fd0e59c6a8b21005bfea6b6b918dde95729dadb2b3e9f73a7202e51cbc2` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 301 / 200 | false | 2224 | 2789 | 29647 | 0 / None | true | — |
| 2 | complete / complete | 200 / None | true | 1 | 1576 | 26287 | 166442 / 1388104 | true | — |
| 3 | response_headers / error | None / None | true | 1 | — | 294 | 0 / None | — | ECONNRESET |

## G116 — es5-import / EXACT_PUBLICATION_DATE_REQUIRED

`EXACT_PUBLICATION_DATE_REQUIRED__IMPORT_VALIDATE__ES5_IMPORT__UNRECOVERABLEERROR__EXACT_PUBLICATION_DATE_REQUIRED__ERROR__EXACT_PUBLICATION_DATE_REQUIRED`

Group key: `b04d6cba70009b6a079275a71990374dde21a2b0855851e7e8d37b8730278aa7`. Lần đầu 30/10/2026 00:46:52.498; lần cuối 30/10/2026 00:46:52.500.

**Số ghi nhận riêng từng mức:** RQ=0; RT=0; RF=0; JF=2. Tổng bản ghi quan sát=2.

**Quan sát:** Validation chặn trước khi gửi ES5. Cả hai payload Instagram kiểm tra lại đều có data.item.createdAt=null.

**Chưa biết/giới hạn:** Không có timestamp native nên chưa xác định được bài có nằm trong cửa sổ 72 giờ. Đây không phải lỗi bulk hay mapping ES5.

**Hướng xử lý:** Hydrate ngày đăng từ permalink/response native có xác minh ID, lưu provenance rồi retry có kiểm soát sau khi sửa producer. Không điền giờ hiện tại, ngày của parent hoặc ngày phỏng đoán.

| Thuộc tính | Giá trị |
|---|---|
| platform | `instagram` |
| phase | `import_validate` |
| originalReason | `EXACT_PUBLICATION_DATE_REQUIRED` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `es5-import` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `—` |
| syscall | `—` |
| errorType | `UnrecoverableError` |
| causeType | `Error` |
| causeCode | `EXACT_PUBLICATION_DATE_REQUIRED` |
| terminalReason | `EXACT_PUBLICATION_DATE_REQUIRED` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `f54e74ca3dee5fddfa57010639519db13e0a988a0ea31740591b1aa57adbd6ae`; event ID: `d061ad89-29fd-4f39-ae5f-2bf788e579dd`.
- Thời điểm: **30/10/2026 00:46:52.498 ICT**; mức `job_failed`; retry đã ghi: `0`.
- Source: [https://www.instagram.com/mantangguo.official/](https://www.instagram.com/mantangguo.official/).
- Post: [https://www.instagram.com/reel/Dd0YX6WCkAh/](https://www.instagram.com/reel/Dd0YX6WCkAh/).
- Request route: `—`.
- elapsedMs=—; wireBytes=—; decodedBytes=—; wireComplete=—.
- Author payload: id=`63222384289`, opaqueId=`—`, profileUrl=`—`.
- Payload kiểm tra lại: item.id=`3995925965695500321`, item.createdAt=`—` (null trong cả hai case), parent.createdAt=`—`.

Không có wire timing trong case này; không suy đoán DNS/TCP/TLS/HTTP stage từ elapsed bị thiếu.

Stack frame đã bỏ message/body:
- `at writeEs (file:///opt/crawler-v8/current/scripts/crawler_queue_flow.mjs:278:17)`
- `at process.processTicksAndRejections (node:internal/process/task_queues:104:5)`
- `at async Worker.connection [as processFn] (file:///opt/crawler-v8/current/scripts/crawler_queue_flow.mjs:306:35)`
- `at async /opt/crawler-v8/queue-deps/node_modules/bullmq/dist/cjs/classes/worker.js:570:32`

### Case 2

- Job ID: `785f8f08597c4059113c7f1daf0a86f4a976d39cdc4f276a990f1e70b543d795`; event ID: `6eb3a187-e8ff-4f93-a3c8-ade32e2e44b3`.
- Thời điểm: **30/10/2026 00:46:52.500 ICT**; mức `job_failed`; retry đã ghi: `0`.
- Source: [https://www.instagram.com/lamen.pizzeria/](https://www.instagram.com/lamen.pizzeria/).
- Post: [https://www.instagram.com/p/DDORgBjpEmm/](https://www.instagram.com/p/DDORgBjpEmm/).
- Request route: `—`.
- elapsedMs=—; wireBytes=—; decodedBytes=—; wireComplete=—.
- Author payload: id=`56599838494`, opaqueId=`—`, profileUrl=`—`.
- Payload kiểm tra lại: item.id=`3516825326508591526`, item.createdAt=`—` (null trong cả hai case), parent.createdAt=`—`.

Không có wire timing trong case này; không suy đoán DNS/TCP/TLS/HTTP stage từ elapsed bị thiếu.

Stack frame đã bỏ message/body:
- `at writeEs (file:///opt/crawler-v8/current/scripts/crawler_queue_flow.mjs:278:17)`
- `at process.processTicksAndRejections (node:internal/process/task_queues:104:5)`
- `at async Worker.connection [as processFn] (file:///opt/crawler-v8/current/scripts/crawler_queue_flow.mjs:306:35)`
- `at async /opt/crawler-v8/queue-deps/node_modules/bullmq/dist/cjs/classes/worker.js:570:32`

## G117 — facebook-user-source / UPSTREAM_NETWORK_ERROR

`UPSTREAM_NETWORK_ERROR__RESPONSE_BODY__ECONNRESET__HTTP_200__BR__WIRE_INCOMPLETE__SOURCE`

Group key: `151624103a33a97805dfe186954d1213faee126072e7bb556c73c7bd7c3aaa23`. Lần đầu 30/10/2026 01:14:27.365; lần cuối 30/10/2026 01:15:26.672.

**Số ghi nhận riêng từng mức:** RQ=2; RT=0; RF=0; JF=0. Tổng bản ghi quan sát=2.

**Quan sát:** Đã có HTTP 200 và nhận được một phần bytes, sau đó reset; wireComplete=false cho thấy body chưa được xác nhận đủ.

**Chưa biết/giới hạn:** Không phải reset CONNECT/TLS. Content-Encoding br không đồng nghĩa lỗi giải nén: không có native Z_DATA_ERROR/Brotli decode error.

**Hướng xử lý:** Đối chiếu responseAborted, byte counts và route; không parse body thiếu thành dữ liệu hoàn chỉnh. Thử lại cùng request shape có kiểm soát và giữ cursor.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `response_body` |
| originalReason | `UPSTREAM_NETWORK_ERROR` |
| nativeCode | `ECONNRESET` |
| connectStatus | `—` |
| httpStatus | `200` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `br` |
| wireComplete | `false` |
| responseAborted | `true` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

Chỉ có **1 job thật** trong nhóm; không bịa case thứ hai.

### Case 1

- Job ID: `1e9371116436a560e2b744f96ba9a52b5ca3bdd9fb37331863cd5baa899890dd`; event ID: `f972a910-bfb8-497c-b219-b27f98e91cdc`.
- Thời điểm: **30/10/2026 01:14:27.365 ICT**; mức `request_error`; retry đã ghi: `0`.
- Source: [https://www.facebook.com/100003693044429](https://www.facebook.com/100003693044429).
- Request route: `https://www.facebook.com/api/graphql/`.
- elapsedMs=28387; wireBytes=60153; decodedBytes=293587; wireComplete=false.
- Proxy endpoint hash: `12fe8772934faddcc1651da315d774a0be9a423fe040d631ab848bf4531f0964` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 3 | response_body / error | 200 / None | true | 0 | 3809 | 28387 | 60153 / 293587 | false | ECONNRESET |

## G118 — instagram-source / UPSTREAM_NETWORK_ERROR

`UPSTREAM_NETWORK_ERROR__RESPONSE_HEADERS__ECONNRESET__SOURCE`

Group key: `d819919a19254bf9aabef71ff95b0c185c5d452938aaf11fba5245bafe192624`. Lần đầu 30/10/2026 00:50:24.091; lần cuối 30/10/2026 00:50:24.630.

**Số ghi nhận riêng từng mức:** RQ=1; RT=1; RF=0; JF=0. Tổng bản ghi quan sát=2.

**Quan sát:** Socket/TLS đã được cấp (nhiều case là socket tái sử dụng) nhưng bị reset trước khi có HTTP header.

**Chưa biết/giới hạn:** Chưa có HTTP status; không được gán thành lỗi TLS handshake hay lỗi nhận body. Có thể liên quan socket reuse, nhưng mẫu chưa chứng minh nguyên nhân.

**Hướng xử lý:** So sánh reusedSocket=true/false và vòng đời keep-alive cùng route; giữ riêng khỏi TLS và body, không tăng retry mù.

| Thuộc tính | Giá trị |
|---|---|
| platform | `instagram` |
| phase | `response_headers` |
| originalReason | `UPSTREAM_NETWORK_ERROR` |
| nativeCode | `ECONNRESET` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

Chỉ có **1 job thật** trong nhóm; không bịa case thứ hai.

### Case 1

- Job ID: `fdbae51ab9c581890f2d6067410304ba5fb41b3b7f3139682744c64b693bc491`; event ID: `53a37535-00c9-491f-bb8a-a3230ab85a63`.
- Thời điểm: **30/10/2026 00:50:24.091 ICT**; mức `request_error`; retry đã ghi: `0`.
- Source: [https://www.instagram.com/cloudpot.official/](https://www.instagram.com/cloudpot.official/).
- Request route: `https://www.instagram.com/p/DfBhvL2I-4U/`.
- elapsedMs=480; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `cd4295c33f9ecc70a23629f4c9a2fb87b8a6a614ceaf3949eea52579523d251d` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 3 | response_headers / error | None / None | true | 1 | — | 480 | 0 / None | — | ECONNRESET |

## G119 — youtube-source / UPSTREAM_NETWORK_ERROR

`UPSTREAM_NETWORK_ERROR__PROXY_TLS__ECONNRESET__SOURCE__UNRECOVERABLEERROR__RETRY_LIMIT_EXHAUSTED`

Group key: `6dd166729fe3d363b6583bb19faac104615df0c2624b0b2b75ff741295ce2aa9`. Lần đầu 30/10/2026 02:17:33.922; lần cuối 30/10/2026 03:35:22.611.

**Số ghi nhận riêng từng mức:** RQ=0; RT=0; RF=0; JF=2. Tổng bản ghi quan sát=2.

**Quan sát:** Kết nối bị reset khi TLS tới origin qua proxy tunnel chưa hoàn tất; ở các case có CONNECT 200 thì tunnel HTTP đã được thiết lập, chưa có HTTP response của origin.

**Chưa biết/giới hạn:** Mã reset không xác định ai cắt: proxy, upstream, intermediary hay thay đổi đường truyền. Không phải reset khi đọc header/body.

**Hướng xử lý:** A/B có kiểm soát theo endpoint hash/target/operation, ghi peer/tunnel timing và trạng thái TLS; kiểm tra nhà cung cấp/đường CONNECT trước khi tăng worker. Không quarantine IP khi chưa có bằng chứng CONNECT-specific.

| Thuộc tính | Giá trị |
|---|---|
| platform | `youtube` |
| phase | `proxy_tls` |
| originalReason | `UPSTREAM_NETWORK_ERROR` |
| nativeCode | `ECONNRESET` |
| connectStatus | `200` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `UnrecoverableError` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `RETRY_LIMIT_EXHAUSTED` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `cace11e70cbf785fa3ff59f45c6ce13a4eb1d40b23513ed7cc7114475fdb787c`; event ID: `a273e5b7-ead3-49ab-a948-1c21a56a8a11`.
- Thời điểm: **30/10/2026 02:17:33.922 ICT**; mức `job_failed`; retry đã ghi: `100`.
- Source: [https://www.youtube.com/channel/UCHCos7l5Nol2OZfFFkDXckg](https://www.youtube.com/channel/UCHCos7l5Nol2OZfFFkDXckg).
- Request route: `https://www.youtube.com/youtubei/v1/browse`.
- elapsedMs=11645; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `eb1e91e5e5edef98237b979af9ae5ad987f02e64ce784cffcb89a3e729609e36` (không phải địa chỉ/credential proxy).
- Checkpoint/coverage giữ lại: `{"proxyRetries": 100, "coverage": {"recoveries": 0, "scope": "anonymous_public_response", "exhausted": false, "complete": false, "observedUnique": 30}, "pagination": {"hasMore": true, "complete": false, "reason": "HTTP_PAGE_BUDGET"}}`. Đây là observed coverage, chưa phải xác nhận ES lưu tất cả item.

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_tls / error | None / 200 | false | — | — | 11645 | 0 / None | — | ECONNRESET |

Stack frame đã bỏ message/body:
- `at Worker.connection [as processFn] (file:///opt/crawler-v8/current/scripts/crawler_queue_flow.mjs:307:54)`
- `at process.processTicksAndRejections (node:internal/process/task_queues:104:5)`
- `at async /opt/crawler-v8/queue-deps/node_modules/bullmq/dist/cjs/classes/worker.js:570:32`

### Case 2

- Job ID: `02fde6b9ea2e4b1ab18468a7d87348ca168ce675e72d9df2075ae20697d66229`; event ID: `a917d733-d6fd-4d97-a5e4-49499185398c`.
- Thời điểm: **30/10/2026 03:35:22.611 ICT**; mức `job_failed`; retry đã ghi: `100`.
- Source: [https://www.youtube.com/channel/UCOEvEldWBMOHNdlzcofFa9w](https://www.youtube.com/channel/UCOEvEldWBMOHNdlzcofFa9w).
- Request route: `https://www.youtube.com/youtubei/v1/browse`.
- elapsedMs=11136; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `d315f663ead47476675cf7808b99870727ed7b681348e9e8f1d79de0860408e9` (không phải địa chỉ/credential proxy).
- Checkpoint/coverage giữ lại: `{"proxyRetries": 100, "coverage": {"recoveries": 0, "scope": "anonymous_public_response", "exhausted": false, "complete": false, "observedUnique": 30}, "pagination": {"hasMore": true, "complete": false, "reason": "HTTP_PAGE_BUDGET"}}`. Đây là observed coverage, chưa phải xác nhận ES lưu tất cả item.

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_tls / error | None / 200 | false | — | — | 11136 | 0 / None | — | ECONNRESET |

Stack frame đã bỏ message/body:
- `at Worker.connection [as processFn] (file:///opt/crawler-v8/current/scripts/crawler_queue_flow.mjs:307:54)`
- `at process.processTicksAndRejections (node:internal/process/task_queues:104:5)`
- `at async /opt/crawler-v8/queue-deps/node_modules/bullmq/dist/cjs/classes/worker.js:570:32`

## G120 — youtube-source / PUBLIC_ITEMS_NOT_RETURNED

`PUBLIC_ITEMS_NOT_RETURNED__HTTP_RESPONSE__HTTP_200__BR__SOURCE`

Group key: `720e1a3efbe33d2635a0e7cfbd2d0ce9ca30ecfd0d4ff90a2ca7d558876710f1`. Lần đầu 30/10/2026 02:47:11.143; lần cuối 30/10/2026 03:51:01.884.

**Số ghi nhận riêng từng mức:** RQ=0; RT=0; RF=2; JF=0. Tổng bản ghi quan sát=2.

**Quan sát:** Reader không nhận được các item công khai mong đợi tại operation source dù HTTP 200; job kết thúc theo policy.

**Chưa biết/giới hạn:** Có thể là không có dữ liệu trong phạm vi đọc, gate, cấu trúc khác hoặc thiếu item; telemetry hiện tại chưa chứng minh riêng nguyên nhân nào.

**Hướng xử lý:** Đối chiếu native end/empty proof, identity, publication window và container item trong case. Không coi HTTP 200 hay việc job completed là bằng chứng crawl đủ.

| Thuộc tính | Giá trị |
|---|---|
| platform | `youtube` |
| phase | `http_response` |
| originalReason | `PUBLIC_ITEMS_NOT_RETURNED` |
| nativeCode | `—` |
| connectStatus | `200` |
| httpStatus | `200` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `br` |
| wireComplete | `true` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `2c90c1397269ee77f2f74cd0914c2b4da13d315c5209bb18ef3b8d586f43942f`; event ID: `a6a20136-6f19-4ddf-89a9-e7ee8e96dbc1`.
- Thời điểm: **30/10/2026 02:47:11.143 ICT**; mức `read_failure`; retry đã ghi: `1`.
- Source: [https://www.youtube.com/channel/UCPw6JbVvK4AaMRkWINnXtVw](https://www.youtube.com/channel/UCPw6JbVvK4AaMRkWINnXtVw).
- Request route: `—`.
- elapsedMs=48328; wireBytes=197095; decodedBytes=1238970; wireComplete=true.
- Proxy endpoint hash: `0a756cc5269ddfeca9187549e4546bd9c970856378e8dd1409becf11b3d9a818` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 200 / 200 | false | 1918 | 2657 | 48328 | 197095 / 1238970 | true | — |

### Case 2

- Job ID: `c8299902f9c5ef5146a318eebc1b06885257f0db6fc6d86683262d8ec6a50704`; event ID: `9ecbe827-6f8d-436a-916f-c998bbf749d3`.
- Thời điểm: **30/10/2026 03:51:01.884 ICT**; mức `read_failure`; retry đã ghi: `2`.
- Source: [https://www.youtube.com/channel/UCTFCm-2nGeSmIndGTqgBHlA](https://www.youtube.com/channel/UCTFCm-2nGeSmIndGTqgBHlA).
- Request route: `—`.
- elapsedMs=27051; wireBytes=121290; decodedBytes=1013057; wireComplete=true.
- Proxy endpoint hash: `dd03ca107d113c8c98e79730642743635fda075e9b4fc0d97d1344bda54bb466` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 200 / 200 | false | 1474 | 2471 | 27051 | 121290 / 1013057 | true | — |

## G121 — youtube-source / PROXY_EXPIRED

`PROXY_EXPIRED__RESPONSE_BODY__PROXY_EXPIRED__HTTP_200__BR__WIRE_COMPLETE__SOURCE`

Group key: `a352959b9fe9a486ff033c135f8b588d3d40249f685c6eccca79c6186eece9bf`. Lần đầu 30/10/2026 01:29:41.156; lần cuối 30/10/2026 01:29:41.217.

**Số ghi nhận riêng từng mức:** RQ=1; RT=1; RF=0; JF=0. Tổng bản ghi quan sát=2.

**Quan sát:** Timer hết hạn lease/proxy khi xử lý response body. Trong 24 request_error của nhóm này, HTTP 200 và wireComplete=true: dữ liệu wire đã nhận đủ.

**Chưa biết/giới hạn:** Không phải bằng chứng socket bị reset hay proxy provider từ chối. decodedEndedMs chưa có ở các case kiểm tra; chưa phân biệt được drain/decode chậm hay TTL còn quá ít.

**Hướng xử lý:** Kiểm tra TTL còn lại trước request và ranh giới đóng lease với giải nén xong. Bảo toàn cursor, cân nhắc đổi lease trước khi bắt đầu request gần hết TTL; không gộp với Z_DATA_ERROR hay ECONNRESET.

| Thuộc tính | Giá trị |
|---|---|
| platform | `youtube` |
| phase | `response_body` |
| originalReason | `PROXY_EXPIRED` |
| nativeCode | `PROXY_EXPIRED` |
| connectStatus | `—` |
| httpStatus | `200` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `br` |
| wireComplete | `true` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

Chỉ có **1 job thật** trong nhóm; không bịa case thứ hai.

### Case 1

- Job ID: `875f3bcf18698fd9a14567c1db3b7b17ebf04795fa184da7ec1294ca4db22037`; event ID: `74c7d93d-64a8-4756-9fbd-4ec86a8818af`.
- Thời điểm: **30/10/2026 01:29:41.156 ICT**; mức `request_error`; retry đã ghi: `24`.
- Source: [https://www.youtube.com/channel/UCIeGXWgrtOo3FiiQZRU_WEg](https://www.youtube.com/channel/UCIeGXWgrtOo3FiiQZRU_WEg).
- Request route: `https://www.youtube.com/youtubei/v1/browse`.
- elapsedMs=8023; wireBytes=29422; decodedBytes=1214318; wireComplete=true.
- Proxy endpoint hash: `d315f663ead47476675cf7808b99870727ed7b681348e9e8f1d79de0860408e9` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 6 | response_body / error | 200 / None | true | 1 | 914 | 8023 | 29422 / 1214318 | true | PROXY_EXPIRED |

## G122 — facebook-page-source / FACEBOOK_RATE_LIMITED

`FACEBOOK_RATE_LIMITED__HTTP_RESPONSE__HTTP_200__BR__SOURCE`

Group key: `c0291a8ba424d8477418d88a2b3cb62beb217ef949e9b54a5e8872a7fa451f0d`. Lần đầu 30/10/2026 00:51:44.395; lần cuối 30/10/2026 03:37:33.543.

**Số ghi nhận riêng từng mức:** RQ=0; RT=2; RF=0; JF=0. Tổng bản ghi quan sát=2.

**Quan sát:** Reader Facebook source phân loại rate limit trong HTTP 200, nhưng native API code không được giữ ở biến thể này.

**Chưa biết/giới hạn:** Không đủ thông tin để nói nó trùng API 1675004 của comment; cần giữ riêng nhóm apiCode chưa ghi.

**Hướng xử lý:** Giữ error.code/subcode và dấu hiệu thông báo đã khử bí mật từ source adapter; đối chiếu request shape và hạn mức source.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `http_response` |
| originalReason | `FACEBOOK_RATE_LIMITED` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `200` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `br` |
| wireComplete | `true` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `a5fcad9f9bd90b7883d0b03bc48cabe38352b4e7997c449d9db9684660963a17`; event ID: `11254e37-033d-4c56-ab0d-0c6e9059068f`.
- Thời điểm: **30/10/2026 00:51:44.395 ICT**; mức `read_retry`; retry đã ghi: `2`.
- Source: [https://www.facebook.com/328704316990585](https://www.facebook.com/328704316990585).
- Request route: `—`.
- elapsedMs=1136; wireBytes=104; decodedBytes=114; wireComplete=true.
- Proxy endpoint hash: `3c7db15748aebefc995baf35ae5ebf48c95bebc35943976e4bb089d13504314e` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 301 / 200 | false | 1629 | 2419 | 25495 | 0 / None | true | — |
| 2 | complete / complete | 200 / None | true | 0 | 1086 | 21801 | 187331 / 981210 | true | — |
| 3 | complete / complete | 200 / None | true | 1 | 597 | 1136 | 104 / 114 | true | — |

### Case 2

- Job ID: `2173331105df7618d48dc3fa7e67b1d233d1fa8e1995ce9f897269be1f7dbf98`; event ID: `6765b4b0-9717-42c7-aeac-354b05529a84`.
- Thời điểm: **30/10/2026 03:37:33.543 ICT**; mức `read_retry`; retry đã ghi: `11`.
- Source: [https://www.facebook.com/1715745595382765](https://www.facebook.com/1715745595382765).
- Request route: `—`.
- elapsedMs=1167; wireBytes=104; decodedBytes=114; wireComplete=true.
- Proxy endpoint hash: `42ee874e1acc169f4ce44a74c10bb52659d42b7761bb8049c8ce8ef8e926f544` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 301 / 200 | false | 1746 | 2489 | 20931 | 0 / None | true | — |
| 2 | complete / complete | 200 / None | true | 0 | 675 | 18094 | 213196 / 1214095 | true | — |
| 3 | complete / complete | 200 / None | true | 0 | 936 | 1167 | 104 / 114 | true | — |

## G123 — facebook-comment / UPSTREAM_NETWORK_ERROR

`UPSTREAM_NETWORK_ERROR__RESPONSE_HEADERS__ECONNRESET__COMMENTS__COMMENTSLISTCOMPONENTSPAGINATIONQUERY`

Group key: `a6bf3f2301e34b9ea77d3ada2efa9401cfc81debdcf1d14f60de86864ff70685`. Lần đầu 30/10/2026 00:55:11.695; lần cuối 30/10/2026 01:10:43.128.

**Số ghi nhận riêng từng mức:** RQ=2; RT=0; RF=0; JF=0. Tổng bản ghi quan sát=2.

**Quan sát:** Socket/TLS đã được cấp (nhiều case là socket tái sử dụng) nhưng bị reset trước khi có HTTP header.

**Chưa biết/giới hạn:** Chưa có HTTP status; không được gán thành lỗi TLS handshake hay lỗi nhận body. Có thể liên quan socket reuse, nhưng mẫu chưa chứng minh nguyên nhân.

**Hướng xử lý:** So sánh reusedSocket=true/false và vòng đời keep-alive cùng route; giữ riêng khỏi TLS và body, không tăng retry mù.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `response_headers` |
| originalReason | `UPSTREAM_NETWORK_ERROR` |
| nativeCode | `ECONNRESET` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `comments` |
| query | `CommentsListComponentsPaginationQuery` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

### Case 1

- Job ID: `85fcdc0d7ed0caa3c67e37d6755725ee27281b4a0296eb95fbbef66b64d0528f`; event ID: `d328f318-c37e-4d6e-833f-1b6b57094c0f`.
- Thời điểm: **30/10/2026 00:55:11.695 ICT**; mức `request_error`; retry đã ghi: `1`.
- Source: [https://www.facebook.com/groups/1023069638660550](https://www.facebook.com/groups/1023069638660550).
- Post: [https://www.facebook.com/1023069638660550_1657314125236095](https://www.facebook.com/1023069638660550_1657314125236095).
- Request route: `https://www.facebook.com/api/graphql/`.
- elapsedMs=246; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `1fbeb8474d73a6439b60037b69c1195e87ff741c1426c79cf23224b16b7f2c58` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 3 | response_headers / error | None / None | true | 1 | — | 246 | 0 / None | — | ECONNRESET |

### Case 2

- Job ID: `e6f3d334dea8728c20459b21857f2ac7cb3767a14491a9b37ce2966df8af13f1`; event ID: `f90046f5-e53c-4a18-a515-00807050ae4b`.
- Thời điểm: **30/10/2026 01:10:43.128 ICT**; mức `request_error`; retry đã ghi: `0`.
- Source: [https://www.facebook.com/groups/1052037723261409](https://www.facebook.com/groups/1052037723261409).
- Post: [https://www.facebook.com/1052037723261409_1751848733280301](https://www.facebook.com/1052037723261409_1751848733280301).
- Request route: `https://www.facebook.com/api/graphql/`.
- elapsedMs=294; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `01a01fd0e59c6a8b21005bfea6b6b918dde95729dadb2b3e9f73a7202e51cbc2` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 3 | response_headers / error | None / None | true | 1 | — | 294 | 0 / None | — | ECONNRESET |

## G124 — facebook-reply / UPSTREAM_NETWORK_ERROR

`UPSTREAM_NETWORK_ERROR__RESPONSE_HEADERS__ECONNRESET__BOOTSTRAP__BOOTSTRAP`

Group key: `716bdc2feb326f9e70e9206996c806adffb52d9563c8c9a9d3e6f8979f2f9fbe`. Lần đầu 30/10/2026 01:54:34.334; lần cuối 30/10/2026 01:54:34.334.

**Số ghi nhận riêng từng mức:** RQ=1; RT=0; RF=0; JF=0. Tổng bản ghi quan sát=1.

**Quan sát:** Socket/TLS đã được cấp (nhiều case là socket tái sử dụng) nhưng bị reset trước khi có HTTP header.

**Chưa biết/giới hạn:** Chưa có HTTP status; không được gán thành lỗi TLS handshake hay lỗi nhận body. Có thể liên quan socket reuse, nhưng mẫu chưa chứng minh nguyên nhân.

**Hướng xử lý:** So sánh reusedSocket=true/false và vòng đời keep-alive cùng route; giữ riêng khỏi TLS và body, không tăng retry mù.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `response_headers` |
| originalReason | `UPSTREAM_NETWORK_ERROR` |
| nativeCode | `ECONNRESET` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `bootstrap` |
| query | `bootstrap` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

Chỉ có **1 job thật** trong nhóm; không bịa case thứ hai.

### Case 1

- Job ID: `17a618c59eb29e61dac213d1973adf542ac27fdd10ffacc1187a7780347fa3a8`; event ID: `4539b5bc-a0e0-4a6b-b286-323504ddbed1`.
- Thời điểm: **30/10/2026 01:54:34.334 ICT**; mức `request_error`; retry đã ghi: `1`.
- Source: [https://www.facebook.com/groups/313318492090124](https://www.facebook.com/groups/313318492090124).
- Post: [https://www.facebook.com/313318492090124_29475038065491446](https://www.facebook.com/313318492090124_29475038065491446).
- Request route: `https://www.facebook.com/groups/otoplusvn/posts/29475038065491446/`.
- elapsedMs=25613; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `affaf876df2d020091c10b062f561aae049fbed6c8785dde7a22374eab9bcdf7` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 2 | response_headers / error | None / None | true | 1 | — | 25613 | 0 / None | — | ECONNRESET |

## G125 — facebook-reply / FACEBOOK_SERVER_ERROR

`FACEBOOK_SERVER_ERROR__HTTP_RESPONSE__HTTP_500__BR__REPLIES__DEPTH1COMMENTSLISTPAGINATIONQUERY`

Group key: `a9147ca5d3240a448f9a9672a31f14d012ad443d7f82bd4f6629e1f7804fab98`. Lần đầu 30/10/2026 01:01:09.050; lần cuối 30/10/2026 01:01:09.050.

**Số ghi nhận riêng từng mức:** RQ=0; RT=1; RF=0; JF=0. Tổng bản ghi quan sát=1.

**Quan sát:** HTTP 500 đã được ghi nhận ở operation replies, khác với TLS hoặc API lỗi trong HTTP 200.

**Chưa biết/giới hạn:** Không có native body/request ID để quy trách nhiệm backend platform hay intermediary; đây là response 500 thực sự được quan sát.

**Hướng xử lý:** Đối chiếu route và request ID đúng case; kiểm tra lại sau có giới hạn. Alias request_error và read_retry có thể là hai lớp của cùng một lỗi, không cộng thành hai request.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `http_response` |
| originalReason | `FACEBOOK_SERVER_ERROR` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `500` |
| apiCode | `—` |
| operation | `replies` |
| query | `Depth1CommentsListPaginationQuery` |
| stage | `—` |
| bodyEncoding | `br` |
| wireComplete | `true` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

Chỉ có **1 job thật** trong nhóm; không bịa case thứ hai.

### Case 1

- Job ID: `38d1d807f3e73cd156b8d09037f35fffa5426d20e6a5f61f839b27d9adb0104c`; event ID: `e80469e8-9c52-4a99-aeaf-4e128161cd2f`.
- Thời điểm: **30/10/2026 01:01:09.050 ICT**; mức `read_retry`; retry đã ghi: `1`.
- Source: [https://www.facebook.com/groups/203503769722679](https://www.facebook.com/groups/203503769722679).
- Post: [https://www.facebook.com/203503769722679_39575669268745973](https://www.facebook.com/203503769722679_39575669268745973).
- Request route: `—`.
- elapsedMs=2214; wireBytes=704; decodedBytes=1543; wireComplete=true.
- Proxy endpoint hash: `f2bd6a7a4ebce4d3b58c87ed69f1a2df8be4cb3c1ad1e8ddf3323dc53e5f4c69` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 301 / 200 | false | 1864 | 2848 | 20400 | 0 / None | true | — |
| 2 | complete / complete | 200 / None | true | 1 | 802 | 17194 | 144851 / 905457 | true | — |
| 3 | complete / complete | 500 / None | true | 0 | 1646 | 2214 | 704 / 1543 | true | — |

## G126 — facebook-page-source / FEED_UNAVAILABLE

`FEED_UNAVAILABLE__HTTP_RESPONSE__HTTP_200__BR__SOURCE`

Group key: `c959d5e5acf6b84eef590c5b455bb9aa5341e06426785f63e4cc7192fef67aa4`. Lần đầu 30/10/2026 01:09:07.905; lần cuối 30/10/2026 01:09:07.905.

**Số ghi nhận riêng từng mức:** RQ=0; RT=0; RF=1; JF=0. Tổng bản ghi quan sát=1.

**Quan sát:** Reader Facebook không có feed công khai dùng được trong HTTP 200 ở source này.

**Chưa biết/giới hạn:** Không đồng nghĩa source không tồn tại, bị xóa hoặc private; không có bằng chứng native đủ cho kết luận đó.

**Hướng xử lý:** Kiểm tra route source, canonical binding và native feed/error node bằng case công khai, giữ nhóm unavailable riêng khỏi HTTP lỗi.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `http_response` |
| originalReason | `FEED_UNAVAILABLE` |
| nativeCode | `—` |
| connectStatus | `200` |
| httpStatus | `200` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `br` |
| wireComplete | `true` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

Chỉ có **1 job thật** trong nhóm; không bịa case thứ hai.

### Case 1

- Job ID: `7b23d52726697f5604e11b112907cc6beae70e35b3586a3fe5086886a707c292`; event ID: `62e64520-c1ed-4c07-8699-3c969a913d63`.
- Thời điểm: **30/10/2026 01:09:07.905 ICT**; mức `read_failure`; retry đã ghi: `0`.
- Source: [https://www.facebook.com/474867892547433](https://www.facebook.com/474867892547433).
- Request route: `—`.
- elapsedMs=3728; wireBytes=141; decodedBytes=184; wireComplete=true.
- Proxy endpoint hash: `12fe8772934faddcc1651da315d774a0be9a423fe040d631ab848bf4531f0964` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 301 / 200 | false | 2830 | 3875 | 33505 | 0 / None | true | — |
| 2 | complete / complete | 302 / None | true | 0 | 875 | 28934 | 0 / None | true | — |
| 3 | complete / complete | 200 / None | true | 0 | 932 | 26452 | 231531 / 1329030 | true | — |
| 4 | complete / complete | 200 / 200 | false | 2266 | 3342 | 3728 | 141 / 184 | true | — |

## G127 — instagram-source / PROXY_EXPIRED

`PROXY_EXPIRED__READ_WORK__PROXY_EXPIRED__SOURCE`

Group key: `9b9b29139787aa8374e7c5140760ecc7bbd1d8b26e0a6e9350b5421e12a23765`. Lần đầu 30/10/2026 00:55:37.235; lần cuối 30/10/2026 00:55:37.235.

**Số ghi nhận riêng từng mức:** RQ=0; RT=1; RF=0; JF=0. Tổng bản ghi quan sát=1.

**Quan sát:** Lease/proxy hết hạn nổi lên trong read_work, chưa có wire timing gắn với lỗi.

**Chưa biết/giới hạn:** Thiếu mốc expiresAt và bước con nên chưa xác nhận nó hết hạn trước hay sau request.

**Hướng xử lý:** Ghi TTL và lifecycle stage vào event, giữ nguyên phân loại chưa xác định thay vì đoán lỗi socket.

| Thuộc tính | Giá trị |
|---|---|
| platform | `instagram` |
| phase | `read_work` |
| originalReason | `PROXY_EXPIRED` |
| nativeCode | `PROXY_EXPIRED` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `—` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

Chỉ có **1 job thật** trong nhóm; không bịa case thứ hai.

### Case 1

- Job ID: `5c61fa02367e57f6a0882f2914e80499e99bd2168f8f921df7c341ad64a7c60b`; event ID: `2c026d9b-d87d-4836-b121-18ece7c98c70`.
- Thời điểm: **30/10/2026 00:55:37.235 ICT**; mức `read_retry`; retry đã ghi: `1`.
- Source: [https://www.instagram.com/lifeatvinamilk/](https://www.instagram.com/lifeatvinamilk/).
- Request route: `—`.
- elapsedMs=—; wireBytes=—; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `b4aa5e353b18d757dec0bd61df049797b4ae99dd1254a9dc4a5bd4cca7f476e0` (không phải địa chỉ/credential proxy).

Không có wire timing trong case này; không suy đoán DNS/TCP/TLS/HTTP stage từ elapsed bị thiếu.

## G128 — facebook-reply / UPSTREAM_HTTP_500

`UPSTREAM_HTTP_500__HTTP_RESPONSE__HTTP_500__BR__REPLIES__DEPTH1COMMENTSLISTPAGINATIONQUERY`

Group key: `aab029dc66820b1268835a43c3ae884649e47b4c70207cfa4bd70e1519ace7d9`. Lần đầu 30/10/2026 01:01:08.895; lần cuối 30/10/2026 01:01:08.895.

**Số ghi nhận riêng từng mức:** RQ=1; RT=0; RF=0; JF=0. Tổng bản ghi quan sát=1.

**Quan sát:** HTTP 500 đã được ghi nhận ở operation replies, khác với TLS hoặc API lỗi trong HTTP 200.

**Chưa biết/giới hạn:** Không có native body/request ID để quy trách nhiệm backend platform hay intermediary; đây là response 500 thực sự được quan sát.

**Hướng xử lý:** Đối chiếu route và request ID đúng case; kiểm tra lại sau có giới hạn. Alias request_error và read_retry có thể là hai lớp của cùng một lỗi, không cộng thành hai request.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `http_response` |
| originalReason | `UPSTREAM_HTTP_500` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `500` |
| apiCode | `—` |
| operation | `replies` |
| query | `Depth1CommentsListPaginationQuery` |
| stage | `—` |
| bodyEncoding | `br` |
| wireComplete | `true` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

Chỉ có **1 job thật** trong nhóm; không bịa case thứ hai.

### Case 1

- Job ID: `38d1d807f3e73cd156b8d09037f35fffa5426d20e6a5f61f839b27d9adb0104c`; event ID: `a430ea50-218f-491f-a97a-2ab2a039d7fd`.
- Thời điểm: **30/10/2026 01:01:08.895 ICT**; mức `request_error`; retry đã ghi: `0`.
- Source: [https://www.facebook.com/groups/203503769722679](https://www.facebook.com/groups/203503769722679).
- Post: [https://www.facebook.com/203503769722679_39575669268745973](https://www.facebook.com/203503769722679_39575669268745973).
- Request route: `—`.
- elapsedMs=2214; wireBytes=704; decodedBytes=1543; wireComplete=true.
- Proxy endpoint hash: `f2bd6a7a4ebce4d3b58c87ed69f1a2df8be4cb3c1ad1e8ddf3323dc53e5f4c69` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 3 | complete / complete | 500 / None | true | 0 | 1646 | 2214 | 704 / 1543 | true | — |

## G129 — threads-comment / UPSTREAM_TIMEOUT

`UPSTREAM_TIMEOUT__HTTP_RESPONSE__HTTP_200__BR__COMMENTS`

Group key: `0e1632a1e14616411ec05a4aa8bb7c12b0cbb87f00000f73d33706edd7d2e01e`. Lần đầu 30/10/2026 01:06:47.811; lần cuối 30/10/2026 01:06:47.811.

**Số ghi nhận riêng từng mức:** RQ=0; RT=1; RF=0; JF=0. Tổng bản ghi quan sát=1.

**Quan sát:** Lượt đọc báo timeout trong khi timing cuối cùng là HTTP 200, wireComplete=true và decodedEndedMs đã có. Request cuối được ghi nhận đã hoàn tất.

**Chưa biết/giới hạn:** Không thể suy ra timeout của chính response 200 này; có thể là budget toàn lượt đọc hoặc bước tiếp theo không được ghi trace.

**Hướng xử lý:** Đánh dấu deadline scope, bắt đầu/kết thúc từng parser và request tiếp theo; liên kết timeout với request ID. Không diễn giải thành mất body hay HTTP timeout đã được chứng minh.

| Thuộc tính | Giá trị |
|---|---|
| platform | `threads` |
| phase | `http_response` |
| originalReason | `UPSTREAM_TIMEOUT` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `200` |
| apiCode | `—` |
| operation | `comments` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `br` |
| wireComplete | `true` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

Chỉ có **1 job thật** trong nhóm; không bịa case thứ hai.

### Case 1

- Job ID: `5e800adf5298a537dbbd6214bf3a60a931c5208bfa80f38346a627eba330e408`; event ID: `de9a9e68-3986-4009-8d85-7a82e1db2336`.
- Thời điểm: **30/10/2026 01:06:47.811 ICT**; mức `read_retry`; retry đã ghi: `6`.
- Source: [https://www.threads.com/@thegioididong_official/](https://www.threads.com/@thegioididong_official/).
- Post: [https://www.threads.com/@thegioididong_official/post/DfCd21jEucw](https://www.threads.com/@thegioididong_official/post/DfCd21jEucw).
- Request route: `—`.
- elapsedMs=21872; wireBytes=142148; decodedBytes=1044770; wireComplete=true.
- Proxy endpoint hash: `263a0fde12b0228de5c2ea4cc471ca2bf53d0da3f0a9bbbf3a98334add20ef69` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 15 | complete / complete | 200 / None | true | 1 | 1151 | 21872 | 142148 / 1044770 | true | — |

## G130 — threads-comment / PROXY_MANAGER_UNAVAILABLE

`PROXY_MANAGER_UNAVAILABLE__PROXY_ASSIGNMENT__COMMENTS`

Group key: `c05e86dec4721cb82c214cd43a6c6af4107507b3f08f690a420c51960e0b417b`. Lần đầu 30/10/2026 00:54:30.415; lần cuối 30/10/2026 00:54:30.415.

**Số ghi nhận riêng từng mức:** RQ=0; RT=1; RF=0; JF=0. Tổng bản ghi quan sát=1.

**Quan sát:** Client không hoàn tất thao tác xin proxy/lease với proxy manager.

**Chưa biết/giới hạn:** Chưa lưu status/cause/endpoint manager cụ thể; không đủ kết luận toàn bộ proxy manager down hay IP upstream lỗi.

**Hướng xử lý:** Ghi riêng manager acquisition/heartbeat/permit/report/release, status và cause gốc. Đối chiếu log manager đúng thời điểm case; không cộng vào reset TLS của platform.

| Thuộc tính | Giá trị |
|---|---|
| platform | `threads` |
| phase | `proxy_assignment` |
| originalReason | `PROXY_MANAGER_UNAVAILABLE` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `comments` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `—` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

Chỉ có **1 job thật** trong nhóm; không bịa case thứ hai.

### Case 1

- Job ID: `448aa1eb8791e72e29c8193a9f0db36d1eba21e62b88098d8b5cba620ef2e29e`; event ID: `92063e9c-0ec6-43bd-bfcf-00abfcf25458`.
- Thời điểm: **30/10/2026 00:54:30.415 ICT**; mức `read_retry`; retry đã ghi: `2`.
- Source: [https://www.threads.com/@thegioididong_official/](https://www.threads.com/@thegioididong_official/).
- Post: [https://www.threads.com/@thegioididong_official/post/DfCcZeQksas](https://www.threads.com/@thegioididong_official/post/DfCcZeQksas).
- Request route: `—`.
- elapsedMs=—; wireBytes=—; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `400d942014123b1801d773e3cb173288d6406033dd334344d3e6fc0268dcc3e7` (không phải địa chỉ/credential proxy).

Không có wire timing trong case này; không suy đoán DNS/TCP/TLS/HTTP stage từ elapsed bị thiếu.

## G131 — facebook-reply / NETWORK_ERROR

`NETWORK_ERROR__RESPONSE_HEADERS__ECONNRESET__BOOTSTRAP__BOOTSTRAP`

Group key: `05715d51b40ac1ddbe626e67361cff0455999e2b8f2681fe51cff6115cdca67c`. Lần đầu 30/10/2026 01:54:34.384; lần cuối 30/10/2026 01:54:34.384.

**Số ghi nhận riêng từng mức:** RQ=0; RT=1; RF=0; JF=0. Tổng bản ghi quan sát=1.

**Quan sát:** Socket/TLS đã được cấp (nhiều case là socket tái sử dụng) nhưng bị reset trước khi có HTTP header.

**Chưa biết/giới hạn:** Chưa có HTTP status; không được gán thành lỗi TLS handshake hay lỗi nhận body. Có thể liên quan socket reuse, nhưng mẫu chưa chứng minh nguyên nhân.

**Hướng xử lý:** So sánh reusedSocket=true/false và vòng đời keep-alive cùng route; giữ riêng khỏi TLS và body, không tăng retry mù.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `response_headers` |
| originalReason | `NETWORK_ERROR` |
| nativeCode | `ECONNRESET` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `bootstrap` |
| query | `bootstrap` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

Chỉ có **1 job thật** trong nhóm; không bịa case thứ hai.

### Case 1

- Job ID: `17a618c59eb29e61dac213d1973adf542ac27fdd10ffacc1187a7780347fa3a8`; event ID: `49798d47-c9d2-4264-9bd6-83c6d80af2e4`.
- Thời điểm: **30/10/2026 01:54:34.384 ICT**; mức `read_retry`; retry đã ghi: `2`.
- Source: [https://www.facebook.com/groups/313318492090124](https://www.facebook.com/groups/313318492090124).
- Post: [https://www.facebook.com/313318492090124_29475038065491446](https://www.facebook.com/313318492090124_29475038065491446).
- Request route: `https://www.facebook.com/groups/otoplusvn/posts/29475038065491446/`.
- elapsedMs=25613; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `affaf876df2d020091c10b062f561aae049fbed6c8785dde7a22374eab9bcdf7` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | response_body / error | 301 / 200 | false | 9035 | 9570 | 35549 | 0 / None | true | ECONNRESET |
| 2 | response_headers / error | None / None | true | 1 | — | 25613 | 0 / None | — | ECONNRESET |

## G132 — youtube-comment / PROXY_EXPIRED

`PROXY_EXPIRED__UNOBSERVED__COMMENTS`

Group key: `808cd6254bea816f60e5e63b045c2d3ec70541a9210b843ec435c412f6f669c3`. Lần đầu 30/10/2026 01:49:35.406; lần cuối 30/10/2026 01:49:35.406.

**Số ghi nhận riêng từng mức:** RQ=0; RT=1; RF=0; JF=0. Tổng bản ghi quan sát=1.

**Quan sát:** Reader hoặc transport báo lease/proxy hết hạn, nhưng phase hiện tại chưa định vị thêm được.

**Chưa biết/giới hạn:** Thiếu mốc expiresAt và bước con nên chưa xác nhận nó hết hạn trước hay sau request.

**Hướng xử lý:** Ghi TTL và lifecycle stage vào event, giữ nguyên phân loại chưa xác định thay vì đoán lỗi socket.

| Thuộc tính | Giá trị |
|---|---|
| platform | `youtube` |
| phase | `unobserved` |
| originalReason | `PROXY_EXPIRED` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `comments` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `—` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

Chỉ có **1 job thật** trong nhóm; không bịa case thứ hai.

### Case 1

- Job ID: `873bd27e4618660227334b3d36d2063798a12476fda624352255bcefad40fdc5`; event ID: `4ff79774-99eb-496f-b7e1-f3c3c0403789`.
- Thời điểm: **30/10/2026 01:49:35.406 ICT**; mức `read_retry`; retry đã ghi: `4`.
- Source: [https://www.youtube.com/channel/UCQ0jSGgYMLmRMeTE6UaPPXg](https://www.youtube.com/channel/UCQ0jSGgYMLmRMeTE6UaPPXg).
- Post: [https://www.youtube.com/watch?v=bnDBBpQYtTc](https://www.youtube.com/watch?v=bnDBBpQYtTc).
- Request route: `—`.
- elapsedMs=—; wireBytes=—; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `f0154747fd463a4eaa4d1cb4e5d512b2e68a2b89e62fc66699afb69b8ea8864d` (không phải địa chỉ/credential proxy).

Không có wire timing trong case này; không suy đoán DNS/TCP/TLS/HTTP stage từ elapsed bị thiếu.

## G133 — facebook-reply / UPSTREAM_NETWORK_ERROR

`UPSTREAM_NETWORK_ERROR__RESPONSE_BODY__ECONNRESET__HTTP_301__WIRE_COMPLETE__BOOTSTRAP__BOOTSTRAP`

Group key: `18c3cd5964baa200a8b144346b7a61f81fc760da0ae71a5f604df6f36ba5b10a`. Lần đầu 30/10/2026 01:54:34.265; lần cuối 30/10/2026 01:54:34.265.

**Số ghi nhận riêng từng mức:** RQ=1; RT=0; RF=0; JF=0. Tổng bản ghi quan sát=1.

**Quan sát:** Response cha HTTP 301 đã complete nhưng được gắn lỗi khi request redirect con thất bại. Đây là ca cần xem liên kết redirect, không mặc định là mất body 301.

**Chưa biết/giới hạn:** Transport truyền exception từ request con vào finish của cha; nhãn phase của cha có thể gây hiểu nhầm. Không tính parent và child thành hai sự cố độc lập.

**Hướng xử lý:** Liên kết parentRequestId/causeRequestId; đối chiếu trace cùng job và trình bày lỗi con là nguyên nhân quan sát chính. Không sửa runtime trong phiên báo cáo này.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `response_body` |
| originalReason | `UPSTREAM_NETWORK_ERROR` |
| nativeCode | `ECONNRESET` |
| connectStatus | `200` |
| httpStatus | `301` |
| apiCode | `—` |
| operation | `bootstrap` |
| query | `bootstrap` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `true` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

Chỉ có **1 job thật** trong nhóm; không bịa case thứ hai.

Đối chiếu bổ sung cùng job `17a618c59eb29e61dac213d1973adf542ac27fdd10ffacc1187a7780347fa3a8` lúc **01:54:34 ICT**: request cha số 1 có HTTP 301, wireComplete=true và elapsed=35.549 ms. Request con số 2 tới `https://www.facebook.com/groups/otoplusvn/posts/29475038065491446/` bị ECONNRESET khi **chờ header**, elapsed=25.613 ms; read_retry cũng xác nhận phase=response_headers. Vì vậy event body/301 là lỗi truyền từ request con, không phải body 301 bị đứt. Hai request_error record này thuộc cùng chuỗi thất bại; giữ nguyên số bản ghi nhưng không tính thành hai sự cố độc lập. Chưa xác định peer cắt request con.

### Case 1

- Job ID: `17a618c59eb29e61dac213d1973adf542ac27fdd10ffacc1187a7780347fa3a8`; event ID: `6d9d8e38-51f0-4953-82a5-6d75b63175b4`.
- Thời điểm: **30/10/2026 01:54:34.265 ICT**; mức `request_error`; retry đã ghi: `1`.
- Source: [https://www.facebook.com/groups/313318492090124](https://www.facebook.com/groups/313318492090124).
- Post: [https://www.facebook.com/313318492090124_29475038065491446](https://www.facebook.com/313318492090124_29475038065491446).
- Request route: `https://www.facebook.com/313318492090124_29475038065491446`.
- elapsedMs=35549; wireBytes=0; decodedBytes=—; wireComplete=true.
- Proxy endpoint hash: `affaf876df2d020091c10b062f561aae049fbed6c8785dde7a22374eab9bcdf7` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | response_body / error | 301 / 200 | false | 9035 | 9570 | 35549 | 0 / None | true | ECONNRESET |

## G134 — threads-comment / NATIVE_REPLY_PAGINATION_UNAVAILABLE

`NATIVE_REPLY_PAGINATION_UNAVAILABLE__SOURCE_READ__COMMENTS__UNRECOVERABLEERROR__NATIVE_REPLY_PAGINATION_UNAVAILABLE`

Group key: `e59960fee6e7acbc374a3de98d2c5bbf8317cfcc35db16f7f2a357489d7651c5`. Lần đầu 30/10/2026 01:10:05.230; lần cuối 30/10/2026 01:10:05.230.

**Số ghi nhận riêng từng mức:** RQ=0; RT=0; RF=0; JF=1. Tổng bản ghi quan sát=1.

**Quan sát:** Reader Threads không có đường phân trang reply native đã xác minh nên không thể chứng minh coverage đầy đủ. Case có expectedPublicCount=3, observedUnique=1 và replyCountMismatches=1.

**Chưa biết/giới hạn:** hasMore=false trong một trường pagination không đồng nghĩa đã đọc hết: coverage.exhausted=false và complete=false. Chưa chứng minh bài không còn reply.

**Hướng xử lý:** Kiểm tra connection con, parent ID/scopeCode và cursor/URL reply trong native payload. Giữ dữ liệu đã quan sát, bổ sung parser phân trang reply; không ép complete=true.

| Thuộc tính | Giá trị |
|---|---|
| platform | `threads` |
| phase | `source_read` |
| originalReason | `NATIVE_REPLY_PAGINATION_UNAVAILABLE` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `comments` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `—` |
| syscall | `—` |
| errorType | `UnrecoverableError` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `NATIVE_REPLY_PAGINATION_UNAVAILABLE` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

Chỉ có **1 job thật** trong nhóm; không bịa case thứ hai.

### Case 1

- Job ID: `11ef91b3459c18283d2db99fa30c1963f96241b87f76f601cef76b6680777b08`; event ID: `71b68f69-1989-4ca9-9b3a-b9832b3c94b2`.
- Thời điểm: **30/10/2026 01:10:05.230 ICT**; mức `job_failed`; retry đã ghi: `0`.
- Source: [https://www.threads.com/@bully_idol_vietnam/](https://www.threads.com/@bully_idol_vietnam/).
- Post: [https://www.threads.com/@bully_idol_vietnam/post/DfC3wdxkuLt](https://www.threads.com/@bully_idol_vietnam/post/DfC3wdxkuLt).
- Request route: `—`.
- elapsedMs=—; wireBytes=—; decodedBytes=—; wireComplete=—.
- Checkpoint/coverage giữ lại: `{"proxyRetries": 0, "coverage": {"version": 4, "policy": "native_meta_comment_pagination_v1", "scope": "anonymous_public_response", "countScope": "roots", "expectedPublicCount": 3, "observedUnique": 1, "observedRootComments": 1, "observedReplies": 0, "countVerified": false, "replyCountsVerified": false, "unknownReplyCounts": 0, "replyCountMismatches": 1, "orphanReplies": 0, "exhausted": false, "publicPaginationComplete": false, "complete": false, "evidence": null, "reason": "NATIVE_REPLY_PAGINATION_UNAVAILABLE"}, "pagination": {"hasMore": false, "complete": false, "reason": "NATIVE_PAGINATION_UNAVAILABLE"}}`. Đây là observed coverage, chưa phải xác nhận ES lưu tất cả item.

Không có wire timing trong case này; không suy đoán DNS/TCP/TLS/HTTP stage từ elapsed bị thiếu.

Stack frame đã bỏ message/body:
- `at crawl (file:///opt/crawler-v8/current/scripts/crawler_queue_flow.mjs:209:93)`
- `at process.processTicksAndRejections (node:internal/process/task_queues:104:5)`
- `at async Worker.connection [as processFn] (file:///opt/crawler-v8/current/scripts/crawler_queue_flow.mjs:306:90)`
- `at async /opt/crawler-v8/queue-deps/node_modules/bullmq/dist/cjs/classes/worker.js:570:32`

## G135 — facebook-reply / NETWORK_ERROR

`NETWORK_ERROR__RESPONSE_BODY__ECONNRESET__HTTP_200__BR__WIRE_INCOMPLETE__REPLIES__DEPTH1COMMENTSLISTPAGINATIONQUERY`

Group key: `622610e95d70c64317ed7f097577f5403e6d2be3766620e4bb5a1969666da025`. Lần đầu 30/10/2026 02:22:40.433; lần cuối 30/10/2026 02:22:40.433.

**Số ghi nhận riêng từng mức:** RQ=0; RT=1; RF=0; JF=0. Tổng bản ghi quan sát=1.

**Quan sát:** Đã có HTTP 200 và nhận được một phần bytes, sau đó reset; wireComplete=false cho thấy body chưa được xác nhận đủ.

**Chưa biết/giới hạn:** Không phải reset CONNECT/TLS. Content-Encoding br không đồng nghĩa lỗi giải nén: không có native Z_DATA_ERROR/Brotli decode error.

**Hướng xử lý:** Đối chiếu responseAborted, byte counts và route; không parse body thiếu thành dữ liệu hoàn chỉnh. Thử lại cùng request shape có kiểm soát và giữ cursor.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `response_body` |
| originalReason | `NETWORK_ERROR` |
| nativeCode | `ECONNRESET` |
| connectStatus | `—` |
| httpStatus | `200` |
| apiCode | `—` |
| operation | `replies` |
| query | `Depth1CommentsListPaginationQuery` |
| stage | `—` |
| bodyEncoding | `br` |
| wireComplete | `false` |
| responseAborted | `true` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

Chỉ có **1 job thật** trong nhóm; không bịa case thứ hai.

### Case 1

- Job ID: `f663b4e5fac77e524c1b63549ba36be52bd5de25d4aa6710c12feded4ee0b8c3`; event ID: `ed0de371-6bec-4e12-9e7b-2b9ff86efdc6`.
- Thời điểm: **30/10/2026 02:22:40.433 ICT**; mức `read_retry`; retry đã ghi: `3`.
- Source: [https://www.facebook.com/groups/1046176849114245](https://www.facebook.com/groups/1046176849114245).
- Post: [https://www.facebook.com/1046176849114245_2971944226537488](https://www.facebook.com/1046176849114245_2971944226537488).
- Request route: `https://www.facebook.com/api/graphql/`.
- elapsedMs=1430; wireBytes=4321; decodedBytes=2419; wireComplete=false.
- Proxy endpoint hash: `5cb681fe5ea3b2dea979e749d2e004dfe18a2bee66e973e220e95d431b0514df` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 301 / 200 | false | 2309 | 2902 | 20262 | 0 / None | true | — |
| 2 | complete / complete | 200 / None | true | 0 | 789 | 16653 | 148816 / 1298760 | true | — |
| 3 | response_body / error | 200 / None | true | 0 | 1200 | 1430 | 4321 / 2419 | false | ECONNRESET |

## G136 — facebook-page-source / FACEBOOK_RATE_LIMITED

`FACEBOOK_RATE_LIMITED__HTTP_RESPONSE__HTTP_200__BR__SOURCE`

Group key: `44ea547de76f39ed9e96f23f21a9ecae66501e102998b113c7c4f0ec29e7675b`. Lần đầu 30/10/2026 00:52:22.629; lần cuối 30/10/2026 00:52:22.629.

**Số ghi nhận riêng từng mức:** RQ=0; RT=1; RF=0; JF=0. Tổng bản ghi quan sát=1.

**Quan sát:** Reader Facebook source phân loại rate limit trong HTTP 200, nhưng native API code không được giữ ở biến thể này.

**Chưa biết/giới hạn:** Không đủ thông tin để nói nó trùng API 1675004 của comment; cần giữ riêng nhóm apiCode chưa ghi.

**Hướng xử lý:** Giữ error.code/subcode và dấu hiệu thông báo đã khử bí mật từ source adapter; đối chiếu request shape và hạn mức source.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `http_response` |
| originalReason | `FACEBOOK_RATE_LIMITED` |
| nativeCode | `—` |
| connectStatus | `200` |
| httpStatus | `200` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `br` |
| wireComplete | `true` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

Chỉ có **1 job thật** trong nhóm; không bịa case thứ hai.

### Case 1

- Job ID: `96e9aabe60423e6a05e792b6857dd3854aded78a88fd3c09fa779bff8cc84cc8`; event ID: `202828a4-64ad-45dc-b9aa-6169cc93ffd0`.
- Thời điểm: **30/10/2026 00:52:22.629 ICT**; mức `read_retry`; retry đã ghi: `1`.
- Source: [https://www.facebook.com/332336930726953](https://www.facebook.com/332336930726953).
- Request route: `—`.
- elapsedMs=4343; wireBytes=104; decodedBytes=114; wireComplete=true.
- Proxy endpoint hash: `3c7db15748aebefc995baf35ae5ebf48c95bebc35943976e4bb089d13504314e` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | complete / complete | 301 / 200 | false | 1959 | 3041 | 30044 | 0 / None | true | — |
| 2 | complete / complete | 200 / None | true | 0 | 1410 | 26440 | 210964 / 1123633 | true | — |
| 3 | complete / complete | 200 / 200 | false | 2878 | 3712 | 4343 | 104 / 114 | true | — |

## G137 — threads-source / PROXY_MANAGER_UNAVAILABLE

`PROXY_MANAGER_UNAVAILABLE__PROXY_ASSIGNMENT__SOURCE`

Group key: `fc237956b63f8f31dfeb3e44ad87eb4f8a643aa7ac312d15afd4d51b0c72920a`. Lần đầu 30/10/2026 00:47:00.049; lần cuối 30/10/2026 00:47:00.049.

**Số ghi nhận riêng từng mức:** RQ=0; RT=1; RF=0; JF=0. Tổng bản ghi quan sát=1.

**Quan sát:** Client không hoàn tất thao tác xin proxy/lease với proxy manager.

**Chưa biết/giới hạn:** Chưa lưu status/cause/endpoint manager cụ thể; không đủ kết luận toàn bộ proxy manager down hay IP upstream lỗi.

**Hướng xử lý:** Ghi riêng manager acquisition/heartbeat/permit/report/release, status và cause gốc. Đối chiếu log manager đúng thời điểm case; không cộng vào reset TLS của platform.

| Thuộc tính | Giá trị |
|---|---|
| platform | `threads` |
| phase | `proxy_assignment` |
| originalReason | `PROXY_MANAGER_UNAVAILABLE` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `—` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

Chỉ có **1 job thật** trong nhóm; không bịa case thứ hai.

### Case 1

- Job ID: `30be694b6048c5fcf3d6fb54a02bbca71ddaea00847cbcb062cae13f1b0d0422`; event ID: `0dee80a8-2b3f-4987-a3a0-fd19b54e76bf`.
- Thời điểm: **30/10/2026 00:47:00.049 ICT**; mức `read_retry`; retry đã ghi: `3`.
- Source: [https://www.threads.com/@_sweetiekynie_](https://www.threads.com/@_sweetiekynie_).
- Request route: `—`.
- elapsedMs=—; wireBytes=—; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `95596101280f3fe35027a8c45359a828b7ef8262f3814efbf3d4224be8e7ecb4` (không phải địa chỉ/credential proxy).

Không có wire timing trong case này; không suy đoán DNS/TCP/TLS/HTTP stage từ elapsed bị thiếu.

## G138 — instagram-comment / UPSTREAM_NETWORK_ERROR

`UPSTREAM_NETWORK_ERROR__PROXY_CONNECT__COMMENTS__UNRECOVERABLEERROR__RETRY_LIMIT_EXHAUSTED`

Group key: `9ac52b04ccc23faf16c01cc4df8aa5ada0540e37a6aaa0cd53ea394680cbcb5c`. Lần đầu 30/10/2026 03:06:15.889; lần cuối 30/10/2026 03:06:15.889.

**Số ghi nhận riêng từng mức:** RQ=0; RT=0; RF=0; JF=1. Tổng bản ghi quan sát=1.

**Quan sát:** Thất bại trước khi ghi nhận CONNECT hoàn tất/socket origin. Không có nativeCode và chưa có HTTP status ở các case mẫu.

**Chưa biết/giới hạn:** Chưa phân biệt được DNS tới proxy, TCP tới proxy, đóng sớm hay timeout tunnel. Tuyệt đối không đổi nhóm này thành ECONNRESET.

**Hướng xử lý:** Bổ sung cause.code/errno/syscall và timing DNS/TCP/CONNECT của agent; kiểm tra proxy-manager/provider log theo endpoint hash và giờ case.

| Thuộc tính | Giá trị |
|---|---|
| platform | `instagram` |
| phase | `proxy_connect` |
| originalReason | `UPSTREAM_NETWORK_ERROR` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `comments` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `UnrecoverableError` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `RETRY_LIMIT_EXHAUSTED` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

Chỉ có **1 job thật** trong nhóm; không bịa case thứ hai.

### Case 1

- Job ID: `bde2ff6e40be20e48f79b31ac5644469bb6b0bd0d9b1ede45df6c3349af4b8d9`; event ID: `504d9dbe-6d3c-4bef-b328-fb10cdf13b81`.
- Thời điểm: **30/10/2026 03:06:15.889 ICT**; mức `job_failed`; retry đã ghi: `100`.
- Source: [https://www.instagram.com/misscosmointernational/](https://www.instagram.com/misscosmointernational/).
- Post: [https://www.instagram.com/p/De_zlaTP_37/](https://www.instagram.com/p/De_zlaTP_37/).
- Request route: `https://www.instagram.com/p/De_zlaTP_37/`.
- elapsedMs=20802; wireBytes=0; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `affaf876df2d020091c10b062f561aae049fbed6c8785dde7a22374eab9bcdf7` (không phải địa chỉ/credential proxy).
- Checkpoint/coverage giữ lại: `{"proxyRetries": 100, "coverage": {"version": 4, "policy": "native_meta_comment_pagination_v1", "scope": "anonymous_public_response", "countScope": "all", "expectedPublicCount": 51365, "observedUnique": 1950, "observedRootComments": 1950, "observedReplies": 0, "countVerified": false, "replyCountsVerified": false, "unknownReplyCounts": 1950, "replyCountMismatches": 0, "orphanReplies": 0, "exhausted": false, "publicPaginationComplete": false, "complete": false, "evidence": null, "reason": "CONTINUATION_PENDING"}, "pagination": {"hasMore": true, "complete": false, "reason": "NATIVE_CONTINUATION_AVAILABLE"}}`. Đây là observed coverage, chưa phải xác nhận ES lưu tất cả item.

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 1 | proxy_connect / error | None / None | false | — | — | 20802 | 0 / None | — | — |

Stack frame đã bỏ message/body:
- `at Worker.connection [as processFn] (file:///opt/crawler-v8/current/scripts/crawler_queue_flow.mjs:307:54)`
- `at process.processTicksAndRejections (node:internal/process/task_queues:104:5)`
- `at async /opt/crawler-v8/queue-deps/node_modules/bullmq/dist/cjs/classes/worker.js:570:32`

## G139 — threads-source / UPSTREAM_API_ERROR

`UPSTREAM_API_ERROR__HTTP_RESPONSE__HTTP_200__BR__SOURCE`

Group key: `d85e5c6d72285082653dec83e0421eb3c190fbebd8645873318eb3572a9087d2`. Lần đầu 30/10/2026 02:46:36.410; lần cuối 30/10/2026 02:46:36.410.

**Số ghi nhận riêng từng mức:** RQ=0; RT=0; RF=1; JF=0. Tổng bản ghi quan sát=1.

**Quan sát:** Reader báo lỗi với chữ ký đã ghi trong bảng dưới.

**Chưa biết/giới hạn:** Bằng chứng chưa đủ để kết luận nguyên nhân sâu hơn.

**Hướng xử lý:** Đối chiếu metadata và native response của 1–2 case; bổ sung trường còn thiếu trước khi sửa policy.

| Thuộc tính | Giá trị |
|---|---|
| platform | `threads` |
| phase | `http_response` |
| originalReason | `UPSTREAM_API_ERROR` |
| nativeCode | `—` |
| connectStatus | `200` |
| httpStatus | `200` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `br` |
| wireComplete | `true` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

Chỉ có **1 job thật** trong nhóm; không bịa case thứ hai.

### Case 1

- Job ID: `26142090d45e42dd68c2a022f85e4c0d277c378e21b97aa3cf7b6e305b8133d0`; event ID: `2cb69bd3-3e71-464f-8249-e3facc644d46`.
- Thời điểm: **30/10/2026 02:46:36.410 ICT**; mức `read_failure`; retry đã ghi: `0`.
- Source: [https://www.threads.com/@myvibofficial](https://www.threads.com/@myvibofficial).
- Request route: `—`.
- elapsedMs=5238; wireBytes=8087; decodedBytes=61388; wireComplete=true.
- Proxy endpoint hash: `3c7db15748aebefc995baf35ae5ebf48c95bebc35943976e4bb089d13504314e` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 2 | complete / complete | 200 / 200 | false | 1867 | 3265 | 5238 | 8087 / 61388 | true | — |

## G140 — facebook-reply / UPSTREAM_NETWORK_ERROR

`UPSTREAM_NETWORK_ERROR__RESPONSE_BODY__ECONNRESET__HTTP_200__BR__WIRE_INCOMPLETE__REPLIES__DEPTH1COMMENTSLISTPAGINATIONQUERY`

Group key: `5c17b76c74ab8d071a83166a00dc54f7f51c93491a6ee2019c4d29d7200aee9f`. Lần đầu 30/10/2026 02:22:40.394; lần cuối 30/10/2026 02:22:40.394.

**Số ghi nhận riêng từng mức:** RQ=1; RT=0; RF=0; JF=0. Tổng bản ghi quan sát=1.

**Quan sát:** Đã có HTTP 200 và nhận được một phần bytes, sau đó reset; wireComplete=false cho thấy body chưa được xác nhận đủ.

**Chưa biết/giới hạn:** Không phải reset CONNECT/TLS. Content-Encoding br không đồng nghĩa lỗi giải nén: không có native Z_DATA_ERROR/Brotli decode error.

**Hướng xử lý:** Đối chiếu responseAborted, byte counts và route; không parse body thiếu thành dữ liệu hoàn chỉnh. Thử lại cùng request shape có kiểm soát và giữ cursor.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `response_body` |
| originalReason | `UPSTREAM_NETWORK_ERROR` |
| nativeCode | `ECONNRESET` |
| connectStatus | `—` |
| httpStatus | `200` |
| apiCode | `—` |
| operation | `replies` |
| query | `Depth1CommentsListPaginationQuery` |
| stage | `—` |
| bodyEncoding | `br` |
| wireComplete | `false` |
| responseAborted | `true` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

Chỉ có **1 job thật** trong nhóm; không bịa case thứ hai.

### Case 1

- Job ID: `f663b4e5fac77e524c1b63549ba36be52bd5de25d4aa6710c12feded4ee0b8c3`; event ID: `eae5d171-f28b-484d-8464-5f8ec90fcb53`.
- Thời điểm: **30/10/2026 02:22:40.394 ICT**; mức `request_error`; retry đã ghi: `2`.
- Source: [https://www.facebook.com/groups/1046176849114245](https://www.facebook.com/groups/1046176849114245).
- Post: [https://www.facebook.com/1046176849114245_2971944226537488](https://www.facebook.com/1046176849114245_2971944226537488).
- Request route: `https://www.facebook.com/api/graphql/`.
- elapsedMs=1430; wireBytes=4321; decodedBytes=2419; wireComplete=false.
- Proxy endpoint hash: `5cb681fe5ea3b2dea979e749d2e004dfe18a2bee66e973e220e95d431b0514df` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 3 | response_body / error | 200 / None | true | 0 | 1200 | 1430 | 4321 / 2419 | false | ECONNRESET |

## G141 — youtube-source / UPSTREAM_TIMEOUT

`UPSTREAM_TIMEOUT__UNOBSERVED__SOURCE__UNRECOVERABLEERROR__RETRY_LIMIT_EXHAUSTED`

Group key: `b8f6265839e6ea3edb8b359dcf170cadce0b404542420b6b9efb89a8d24663f1`. Lần đầu 30/10/2026 02:10:06.631; lần cuối 30/10/2026 02:10:06.631.

**Số ghi nhận riêng từng mức:** RQ=0; RT=0; RF=0; JF=1. Tổng bản ghi quan sát=1.

**Quan sát:** Hết thời gian của lượt đọc, nhưng không có networkTimings để định vị đến DNS/CONNECT/TLS/header/body.

**Chưa biết/giới hạn:** UPSTREAM_TIMEOUT là mã tổng hợp của ứng dụng; không phải bằng chứng native ETIMEDOUT. Không có elapsedMs ở các case này.

**Hướng xử lý:** Bổ sung trace trước acquisition/permit/request và giữ timing khi dispose/timeout. Giữ nhóm UNOBSERVED riêng; dùng job ID/cursor của case để tái hiện, không gán nguyên nhân cho proxy.

| Thuộc tính | Giá trị |
|---|---|
| platform | `youtube` |
| phase | `unobserved` |
| originalReason | `UPSTREAM_TIMEOUT` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `—` |
| syscall | `—` |
| errorType | `UnrecoverableError` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `RETRY_LIMIT_EXHAUSTED` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

Chỉ có **1 job thật** trong nhóm; không bịa case thứ hai.

### Case 1

- Job ID: `a75f850dc0b65f492420fc2ac7909cc7f1a130d2dcd1825469a19ac904897fc5`; event ID: `afbad20d-0698-4e9e-ac3f-54eed086fa95`.
- Thời điểm: **30/10/2026 02:10:06.631 ICT**; mức `job_failed`; retry đã ghi: `100`.
- Source: [https://www.youtube.com/channel/UCIg56SgvoZF8Qg0Jx_gh6Pg](https://www.youtube.com/channel/UCIg56SgvoZF8Qg0Jx_gh6Pg).
- Request route: `—`.
- elapsedMs=—; wireBytes=—; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `affaf876df2d020091c10b062f561aae049fbed6c8785dde7a22374eab9bcdf7` (không phải địa chỉ/credential proxy).
- Checkpoint/coverage giữ lại: `{"proxyRetries": 100, "coverage": {"recoveries": 0, "scope": "anonymous_public_response", "exhausted": false, "complete": false, "observedUnique": 30}, "pagination": {"hasMore": true, "complete": false, "reason": "HTTP_PAGE_BUDGET"}}`. Đây là observed coverage, chưa phải xác nhận ES lưu tất cả item.

Không có wire timing trong case này; không suy đoán DNS/TCP/TLS/HTTP stage từ elapsed bị thiếu.

Stack frame đã bỏ message/body:
- `at Worker.connection [as processFn] (file:///opt/crawler-v8/current/scripts/crawler_queue_flow.mjs:307:54)`
- `at process.processTicksAndRejections (node:internal/process/task_queues:104:5)`
- `at async /opt/crawler-v8/queue-deps/node_modules/bullmq/dist/cjs/classes/worker.js:570:32`

## G142 — instagram-comment / PROXY_MANAGER_UNAVAILABLE

`PROXY_MANAGER_UNAVAILABLE__PROXY_ASSIGNMENT__COMMENTS`

Group key: `dd392b94ab8426309386f28f7082179f3091842d4c4351f764382860dad2775d`. Lần đầu 30/10/2026 02:04:08.317; lần cuối 30/10/2026 02:04:08.317.

**Số ghi nhận riêng từng mức:** RQ=0; RT=1; RF=0; JF=0. Tổng bản ghi quan sát=1.

**Quan sát:** Client không hoàn tất thao tác xin proxy/lease với proxy manager.

**Chưa biết/giới hạn:** Chưa lưu status/cause/endpoint manager cụ thể; không đủ kết luận toàn bộ proxy manager down hay IP upstream lỗi.

**Hướng xử lý:** Ghi riêng manager acquisition/heartbeat/permit/report/release, status và cause gốc. Đối chiếu log manager đúng thời điểm case; không cộng vào reset TLS của platform.

| Thuộc tính | Giá trị |
|---|---|
| platform | `instagram` |
| phase | `proxy_assignment` |
| originalReason | `PROXY_MANAGER_UNAVAILABLE` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `comments` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `—` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

Chỉ có **1 job thật** trong nhóm; không bịa case thứ hai.

### Case 1

- Job ID: `5e988818a9fdf67ef3a3d1308bf91591b8d35386a36734351b6536a92fbdc32b`; event ID: `17d98ed6-d77e-4005-af83-ff57220afdf3`.
- Thời điểm: **30/10/2026 02:04:08.317 ICT**; mức `read_retry`; retry đã ghi: `58`.
- Source: [https://www.instagram.com/missuupdates/](https://www.instagram.com/missuupdates/).
- Post: [https://www.instagram.com/p/DfCPTvMAiId/](https://www.instagram.com/p/DfCPTvMAiId/).
- Request route: `—`.
- elapsedMs=—; wireBytes=—; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `e49bb3d44b8077d1838aea4f7ae0d3974411f66264b335e4256af14bf034cef0` (không phải địa chỉ/credential proxy).

Không có wire timing trong case này; không suy đoán DNS/TCP/TLS/HTTP stage từ elapsed bị thiếu.

## G143 — facebook-group-source / UPSTREAM_HTTP_500

`UPSTREAM_HTTP_500__HTTP_RESPONSE__HTTP_500__BR__SOURCE`

Group key: `1b208c37d17597b7eb1754af2517ec955becf551728529db627d7c369736df0c`. Lần đầu 30/10/2026 02:50:58.605; lần cuối 30/10/2026 02:50:58.605.

**Số ghi nhận riêng từng mức:** RQ=1; RT=0; RF=0; JF=0. Tổng bản ghi quan sát=1.

**Quan sát:** HTTP 500 đã được ghi nhận ở operation source, khác với TLS hoặc API lỗi trong HTTP 200.

**Chưa biết/giới hạn:** Không có native body/request ID để quy trách nhiệm backend platform hay intermediary; đây là response 500 thực sự được quan sát.

**Hướng xử lý:** Đối chiếu route và request ID đúng case; kiểm tra lại sau có giới hạn. Alias request_error và read_retry có thể là hai lớp của cùng một lỗi, không cộng thành hai request.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `http_response` |
| originalReason | `UPSTREAM_HTTP_500` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `500` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `br` |
| wireComplete | `true` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

Chỉ có **1 job thật** trong nhóm; không bịa case thứ hai.

### Case 1

- Job ID: `076815c416353276c819762f9cb5b64beb84b6cf60fda9d5ea40854862c97993`; event ID: `cc629cb2-26b9-4ef7-85de-8b2a902121c0`.
- Thời điểm: **30/10/2026 02:50:58.605 ICT**; mức `request_error`; retry đã ghi: `3`.
- Source: [https://www.facebook.com/groups/3692693437721447](https://www.facebook.com/groups/3692693437721447).
- Request route: `—`.
- elapsedMs=2220; wireBytes=746; decodedBytes=1542; wireComplete=true.
- Proxy endpoint hash: `9e1c4ce350af423e000416c11bd26ab4624c26ab69ca4e481820f4a03a5019aa` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 6 | complete / complete | 500 / None | true | 0 | 1804 | 2220 | 746 / 1542 | true | — |

## G144 — instagram-source / PROXY_MANAGER_UNAVAILABLE

`PROXY_MANAGER_UNAVAILABLE__READ_WORK__PROXY_MANAGER_UNAVAILABLE__SOURCE`

Group key: `ac27f14a97e20c1c5541548e40140f4d47d5c6ebc2f20e981935d80eedb8da00`. Lần đầu 30/10/2026 03:20:48.620; lần cuối 30/10/2026 03:20:48.620.

**Số ghi nhận riêng từng mức:** RQ=0; RT=1; RF=0; JF=0. Tổng bản ghi quan sát=1.

**Quan sát:** Lỗi proxy manager nổi lên trong read_work; mã tổng hợp có nhưng không có timing request manager chi tiết.

**Chưa biết/giới hạn:** Chưa lưu status/cause/endpoint manager cụ thể; không đủ kết luận toàn bộ proxy manager down hay IP upstream lỗi.

**Hướng xử lý:** Ghi riêng manager acquisition/heartbeat/permit/report/release, status và cause gốc. Đối chiếu log manager đúng thời điểm case; không cộng vào reset TLS của platform.

| Thuộc tính | Giá trị |
|---|---|
| platform | `instagram` |
| phase | `read_work` |
| originalReason | `PROXY_MANAGER_UNAVAILABLE` |
| nativeCode | `PROXY_MANAGER_UNAVAILABLE` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `—` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

Chỉ có **1 job thật** trong nhóm; không bịa case thứ hai.

### Case 1

- Job ID: `bef78b3fcc774f909ba6532934ffaa544d00046d7f880465e313d9f4f9601e70`; event ID: `d83ea01d-eb15-4e45-9ebf-5d27cec0ba3a`.
- Thời điểm: **30/10/2026 03:20:48.620 ICT**; mức `read_retry`; retry đã ghi: `38`.
- Source: [https://www.instagram.com/cgvcinemasvietnam/](https://www.instagram.com/cgvcinemasvietnam/).
- Request route: `—`.
- elapsedMs=—; wireBytes=—; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `eb1e91e5e5edef98237b979af9ae5ad987f02e64ce784cffcb89a3e729609e36` (không phải địa chỉ/credential proxy).

Không có wire timing trong case này; không suy đoán DNS/TCP/TLS/HTTP stage từ elapsed bị thiếu.

## G145 — instagram-source / PROXY_EXPIRED

`PROXY_EXPIRED__PROXY_HEARTBEAT__PROXY_EXPIRED__SOURCE`

Group key: `18e17e6b89c734b9b20e6e28db79de2b2728b67284558ddf764348ca6d55671d`. Lần đầu 30/10/2026 03:52:32.096; lần cuối 30/10/2026 03:52:32.096.

**Số ghi nhận riêng từng mức:** RQ=0; RT=1; RF=0; JF=0. Tổng bản ghi quan sát=1.

**Quan sát:** Lease đã hết hạn khi kiểm tra heartbeat trước khi tiếp tục đọc; đây là vòng đời lease, không phải lỗi HTTP response.

**Chưa biết/giới hạn:** Không có bằng chứng target platform lỗi; thời điểm hết hạn không đo được từ body do chưa có request mới.

**Hướng xử lý:** Đối chiếu expiresAt/heartbeat và thay lease theo policy giữ cursor. Phân loại như sự kiện vòng đời cần theo dõi, tách khỏi sự cố mạng.

| Thuộc tính | Giá trị |
|---|---|
| platform | `instagram` |
| phase | `proxy_heartbeat` |
| originalReason | `PROXY_EXPIRED` |
| nativeCode | `PROXY_EXPIRED` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `—` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

Chỉ có **1 job thật** trong nhóm; không bịa case thứ hai.

### Case 1

- Job ID: `ccb493552974a117f976d9733149760b7ff9647577345918452c21e8e307d427`; event ID: `83ddfdc1-0d4e-4814-9652-e4a905898aa9`.
- Thời điểm: **30/10/2026 03:52:32.096 ICT**; mức `read_retry`; retry đã ghi: `1`.
- Source: [https://www.instagram.com/warningzone.saigon/](https://www.instagram.com/warningzone.saigon/).
- Request route: `—`.
- elapsedMs=—; wireBytes=—; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `6435ac2d8b512f971652983ba5bdded2f76be7ba79bdecea77c799dd8f0b900c` (không phải địa chỉ/credential proxy).

Không có wire timing trong case này; không suy đoán DNS/TCP/TLS/HTTP stage từ elapsed bị thiếu.

## G146 — find-uid / FACEBOOK_PROFILE_HTTP_500

`FACEBOOK_PROFILE_HTTP_500__UID_LOOKUP__HTTP_500__LOCAL_CURL_PROFILE__UNRECOVERABLEERROR`

Group key: `faff53eb777661eea160d6c87a94bde911673bb6e5276997a227f82bb8d81f53`. Lần đầu 30/10/2026 03:35:19.249; lần cuối 30/10/2026 03:35:19.249.

**Số ghi nhận riêng từng mức:** RQ=0; RT=0; RF=0; JF=1. Tổng bản ghi quan sát=1.

**Quan sát:** Lượt lấy profile của worker UID nhận HTTP 500. Đây là lỗi HTTP ở bước lookup profile, tách khỏi thiếu UID trong HTTP 200.

**Chưa biết/giới hạn:** Không có response body lỗi đã khử bí mật nên chưa biết backend platform, route hay tầng trung gian nào trả 500.

**Hướng xử lý:** So cùng profile qua phiên/route khác khi điều tra, giữ status và request ID nếu upstream có. Không chuyển thành lỗi UID không tồn tại; chỉ retry có giới hạn sau quyết định vận hành.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `uid_lookup` |
| originalReason | `FACEBOOK_PROFILE_HTTP_500` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `500` |
| apiCode | `—` |
| operation | `local_curl_profile` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `—` |
| syscall | `—` |
| errorType | `UnrecoverableError` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

Chỉ có **1 job thật** trong nhóm; không bịa case thứ hai.

### Case 1

- Job ID: `f9b03b9855bcee3a651a0361f2398cea38655b0b334cbefa623be6b9a5d59b22`; event ID: `43e7591bc34775397485b40bf0a6016e3a496b678bcc40d896c1421ab8758a31`.
- Thời điểm: **30/10/2026 03:35:19.249 ICT**; mức `job_failed`; retry đã ghi: `—`.
- Source: [https://www.facebook.com/groups/1927097800974773](https://www.facebook.com/groups/1927097800974773).
- Post: [https://www.facebook.com/1927097800974773_3040252862992589](https://www.facebook.com/1927097800974773_3040252862992589).
- Request route: `—`.
- elapsedMs=—; wireBytes=—; decodedBytes=—; wireComplete=—.
- Author payload: id=`—`, opaqueId=`pfbid0xBAvsBpxFbtbwVsEaNPGUnTod9PdFeUsyWYaNs2K29VC21QKZCWLK1ag5BtwWrJml`, profileUrl=`—`.
- Profile lookup suy ra đúng hàm uidLookupUrl: [facebook.com/pfbid0xBAvsBpxFbtbwVsEaNPGUnTod9PdFeUsyWYaNs2K29VC21QKZCWLK1ag5BtwWrJml](https://www.facebook.com/pfbid0xBAvsBpxFbtbwVsEaNPGUnTod9PdFeUsyWYaNs2K29VC21QKZCWLK1ag5BtwWrJml).

Không có wire timing trong case này; không suy đoán DNS/TCP/TLS/HTTP stage từ elapsed bị thiếu.

Stack frame đã bỏ message/body:
- `at requestProfile (file:///Users/phuctran/Workspace/crawler-2026/scripts/local_find_uid_worker.mjs:56:18)`
- `at process.processTicksAndRejections (node:internal/process/task_queues:95:5)`
- `at async lookup (file:///Users/phuctran/Workspace/crawler-2026/scripts/local_find_uid_worker.mjs:74:18)`
- `at async Worker.connection [as processFn] (file:///Users/phuctran/Workspace/crawler-2026/scripts/local_find_uid_worker.mjs:81:15)`

## G147 — youtube-comment / PROXY_MANAGER_UNAVAILABLE

`PROXY_MANAGER_UNAVAILABLE__PROXY_ASSIGNMENT__COMMENTS`

Group key: `85820e285d83583b0b3bee7de3391d93e062e246457a6a8aa3ed8d0f64918a28`. Lần đầu 30/10/2026 02:16:20.478; lần cuối 30/10/2026 02:16:20.478.

**Số ghi nhận riêng từng mức:** RQ=0; RT=1; RF=0; JF=0. Tổng bản ghi quan sát=1.

**Quan sát:** Client không hoàn tất thao tác xin proxy/lease với proxy manager.

**Chưa biết/giới hạn:** Chưa lưu status/cause/endpoint manager cụ thể; không đủ kết luận toàn bộ proxy manager down hay IP upstream lỗi.

**Hướng xử lý:** Ghi riêng manager acquisition/heartbeat/permit/report/release, status và cause gốc. Đối chiếu log manager đúng thời điểm case; không cộng vào reset TLS của platform.

| Thuộc tính | Giá trị |
|---|---|
| platform | `youtube` |
| phase | `proxy_assignment` |
| originalReason | `PROXY_MANAGER_UNAVAILABLE` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `—` |
| apiCode | `—` |
| operation | `comments` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `—` |
| wireComplete | `—` |
| responseAborted | `—` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

Chỉ có **1 job thật** trong nhóm; không bịa case thứ hai.

### Case 1

- Job ID: `974fcb5bfc2c3703c4a00e769bc0142da57a29db468102c2730e6f996c1b35fb`; event ID: `51f6b893-a854-4531-8144-a75a8444f88c`.
- Thời điểm: **30/10/2026 02:16:20.478 ICT**; mức `read_retry`; retry đã ghi: `1`.
- Source: [https://www.youtube.com/channel/UC3O-gNkOsgemkuhuAopEGbA](https://www.youtube.com/channel/UC3O-gNkOsgemkuhuAopEGbA).
- Post: [https://www.youtube.com/watch?v=GgOgjSlL4Pc](https://www.youtube.com/watch?v=GgOgjSlL4Pc).
- Request route: `—`.
- elapsedMs=—; wireBytes=—; decodedBytes=—; wireComplete=—.
- Proxy endpoint hash: `400d942014123b1801d773e3cb173288d6406033dd334344d3e6fc0268dcc3e7` (không phải địa chỉ/credential proxy).

Không có wire timing trong case này; không suy đoán DNS/TCP/TLS/HTTP stage từ elapsed bị thiếu.

## G148 — facebook-group-source / FACEBOOK_SERVER_ERROR

`FACEBOOK_SERVER_ERROR__HTTP_RESPONSE__HTTP_500__BR__SOURCE`

Group key: `9b8b05c53bbf253589c305a7a3fe249d8cff3d3d08f4e14fefd30299c06f8177`. Lần đầu 30/10/2026 02:50:58.970; lần cuối 30/10/2026 02:50:58.970.

**Số ghi nhận riêng từng mức:** RQ=0; RT=1; RF=0; JF=0. Tổng bản ghi quan sát=1.

**Quan sát:** HTTP 500 đã được ghi nhận ở operation source, khác với TLS hoặc API lỗi trong HTTP 200.

**Chưa biết/giới hạn:** Không có native body/request ID để quy trách nhiệm backend platform hay intermediary; đây là response 500 thực sự được quan sát.

**Hướng xử lý:** Đối chiếu route và request ID đúng case; kiểm tra lại sau có giới hạn. Alias request_error và read_retry có thể là hai lớp của cùng một lỗi, không cộng thành hai request.

| Thuộc tính | Giá trị |
|---|---|
| platform | `facebook` |
| phase | `http_response` |
| originalReason | `FACEBOOK_SERVER_ERROR` |
| nativeCode | `—` |
| connectStatus | `—` |
| httpStatus | `500` |
| apiCode | `—` |
| operation | `source` |
| query | `—` |
| stage | `—` |
| bodyEncoding | `br` |
| wireComplete | `true` |
| responseAborted | `false` |
| syscall | `—` |
| errorType | `—` |
| causeType | `—` |
| causeCode | `—` |
| terminalReason | `—` |
| esErrorType | `—` |
| esCauseType | `—` |
| esField | `—` |
| stackSite | `—` |

Chỉ có **1 job thật** trong nhóm; không bịa case thứ hai.

### Case 1

- Job ID: `076815c416353276c819762f9cb5b64beb84b6cf60fda9d5ea40854862c97993`; event ID: `0410eac4-b4c5-43f0-ace6-a8e7a1e191df`.
- Thời điểm: **30/10/2026 02:50:58.970 ICT**; mức `read_retry`; retry đã ghi: `4`.
- Source: [https://www.facebook.com/groups/3692693437721447](https://www.facebook.com/groups/3692693437721447).
- Request route: `—`.
- elapsedMs=2220; wireBytes=746; decodedBytes=1542; wireComplete=true.
- Proxy endpoint hash: `9e1c4ce350af423e000416c11bd26ab4624c26ab69ca4e481820f4a03a5019aa` (không phải địa chỉ/credential proxy).

| Req | Phase / outcome | HTTP / CONNECT | Reuse | TLS ms | Header ms | Tổng ms | Wire / decoded bytes | Wire đủ | Native |
|---|---|---|---|---|---|---|---|---|---|
| 6 | complete / complete | 500 / None | true | 0 | 1804 | 2220 | 746 / 1542 | true | — |
