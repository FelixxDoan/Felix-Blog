---
title: "CaaS from Scratch: MVP chạy được ≠ xong — Tối ưu Dev Workflow cho Monorepo"
description: "Post tổng kết series với góc nhìn production-minded: base image chung, cache deps bằng pnpm-store + node_modules volumes, đo Time-to-First-Request (TTFR) qua /healthz, và một incident ESM vs CommonJS trong workspace."
pubDate: 2026-02-23
heroImage: "../_shared/caas-from-scratch/post5/hero.png"
lang: vi
tags:
  - caas
  - docker
  - docker-compose
  - monorepo
  - pnpm
  - nodejs
  - devx
  - performance
---
**Tác giả:** Felix Doan  
**Repo:** https://github.com/FelixxDoan/Container-as-a-Service

---

Ở các bài trước, mình tập trung vào kiến trúc và các kỹ thuật lõi để Container-as-a-Service chạy được. Tới bài này, mình muốn “hạ cánh” series theo một góc nhìn thực tế hơn:

**MVP chạy được không đồng nghĩa với “đã xong”.**

Cùng một stack, trên máy mới hoàn toàn có thể chạy rất “nặng”, nhưng sau khi vào nhịp thì lại “mượt” nếu workflow được thiết kế đúng. Vì vậy, mục tiêu của bài này là chứng minh hai thứ mà recruiter (và cả mình) đều quan tâm:

- Mình **biết** đâu là điểm nghẽn: image/deps/bootstrap.
- Mình **thiết kế workflow** để dev loop nhanh dần theo thời gian, thay vì “chạy được là xong”.

## Mình đo cái gì, và đo như thế nào?

Ban đầu mình hay đo kiểu “container Up mất bao lâu”, nhưng nhanh chóng nhận ra:

> **Up ≠ Ready.**

Container `Up` chỉ nói rằng process chạy, không nói rằng app đã sẵn sàng nhận request (chờ Redis/Mongo, init middleware, watchers, seed…). Vì vậy mình đổi sang metric thực dụng hơn:

- **TTFR (Time-to-First-Request)**: từ lúc `docker compose up -d` đến khi `curl /healthz` trả OK.

Gateway có endpoint:

```bash
GET /healthz  ->  { ok: true, service: "gateway" }
```

![TTFR](../_shared/caas-from-scratch/post5/TTFR.png)

## Vì sao startup chậm “lần đầu”: dependency + toolchain

Dự án là monorepo gồm nhiều service (gateway, auth, user, class, admin, portal UI…). Goal của mình rất đơn giản:

> `docker compose up` là dev được toàn bộ stack.
  
Nhưng trên máy mới hoàn toàn, “lần đầu” luôn tốn thời gian vì:

- Pull base images (Mongo/Redis/MinIO/Traefik…)
- Tạo volumes lần đầu
- Hydrate dependency (đặc biệt có native modules cần toolchain)
- Dev mode dùng `nodemon` (nằm trong `devDependencies`) → deps lệch là service chết ngay

Thay vì “che” điều này, mình chọn cách thừa nhận và tối ưu theo hướng:

- **Lần đầu** chậm là bình thường.
- Nhưng **lần sau** phải nhanh, và “nhanh” đó đến từ thiết kế cache/volume hợp lý.

## Bước 1: build base image chung để giảm setup trùng lặp

Một chỗ tốn thời gian ở monorepo là việc mỗi service cần môi trường Node giống nhau + toolchain để build dependency native (`python/make/g++`). Nếu để từng service tự cài, chi phí setup sẽ bị nhân lên.

Giải pháp mình chọn là **base image chung** cho toàn stack: cài Node + pnpm + toolchain một lần.

Cold build base image (máy mới):

![Build base](../_shared/caas-from-scratch/post5/base.png)

> Thông điệp mình muốn nhấn mạnh: “trả phí build base 1 lần để đổi lại môi trường đồng nhất và ít bất ngờ hơn khi chạy nhiều service”.

## Bước 2: tối ưu dev loop bằng volumes (pnpm-store + node_modules)

Mục tiêu của mình là:

- Hot reload được (mount source),
- nhưng **không phải install lại deps** mỗi lần `up`.

Trong `docker-compose.dev.yml`, mình chọn:

- Mount toàn repo vào `/app` để hot reload.
- Tách volume để cache:
  - `pnpm_store` (pnpm store cache),
  - `root_node_modules`,
  - và `*_modules` theo từng service (gateway/auth/user/…).

Đồng thời mình có cơ chế **stamp + lock**:

- Stamp lưu hash của `package.json`
- Lock tránh nhiều service install cùng lúc
- Nếu hash không đổi và node_modules đã có → skip install

Kết quả là: sau lần hydrate đầu tiên, stack “warm” lên rất rõ.

## Bonus quan trọng: `docker compose down` vs `down -v` (đây là chỗ dễ đo sai)

Khi bắt đầu benchmark, mình nhận ra một chi tiết nhỏ nhưng ảnh hưởng cực lớn: **mình có xóa volume hay không**.

- `docker compose down` chỉ dừng và gỡ container/network. **Volume vẫn còn**, nên Redis/Mongo (và state liên quan) được giữ lại.
- `docker compose down -v` thì “reset sạch” luôn volume. Lần chạy sau phải **tạo volume mới + khởi tạo lại dữ liệu/trạng thái**, nên thời gian sẵn sàng thường lâu hơn.

### So sánh nhanh mình đo được

**Kịch bản 1 — Warm restart (giữ volume):**

![Warm restart](../_shared/caas-from-scratch/post5/warm.png)

**Kịch bản 2 — Wipe volumes (reset sạch):**

![Wipe volumes](../_shared/caas-from-scratch/post5/wipe.png)

> Bài học rút ra: khi benchmark dev loop, mình luôn ghi rõ “có `-v` hay không”, vì đây là hai câu chuyện khác nhau: **warm restart** vs **fresh bootstrap**.

## Một incident nhỏ nhưng đáng giá: ESM vs CommonJS trong workspace

Trong quá trình đo TTFR, mình gặp một lỗi tưởng như network nhưng thực ra là runtime crash:

- Gateway crash → `curl /healthz` bị `connection reset`

Nguyên nhân là module format trong workspace:

- `packages/db` viết theo ESM (`export const redis...`)
- nhưng `packages/db/package.json` **thiếu** `"type": "module"`
- Node hiểu `.js` là CommonJS → import named export fail → gateway chết ngay lúc boot

Fix rất nhỏ (thêm `"type": "module"`), nhưng bài học lớn:

- Trong monorepo, chỉ cần **một package lệch module type** là kéo sập runtime.
- Những lỗi “vặt” này chính là nơi dự án thể hiện mindset production: phát hiện nhanh, fix gọn, rút kinh nghiệm.

## Roadmap ngắn

Mình không muốn hứa “đưa lên K8s” cho oai. Roadmap của mình ưu tiên những thứ làm dự án đáng tin hơn:

- Healthcheck/ready check rõ ràng hơn cho gateway và các service quan trọng
- Logging/audit tối thiểu (đặc biệt gateway/auth)
- Cleanup/TTL cho resource (container/volume/temp artifacts) để demo không “rác dần” theo thời gian

Khi (và chỉ khi) có nhu cầu scale thật sự (multi-node, scheduling, auto-heal…), lúc đó mới cân nhắc K8s/ECS.

## Kết bài

Nếu các bài trước trả lời câu hỏi “làm sao để CaaS chạy được?”, thì bài này là câu hỏi tiếp theo:

> **làm sao để nó chạy mượt, đo được, và lặp lại được?**

Mình tin đây là ranh giới rất rõ giữa một bài tập “chạy được” và một dự án “đáng tin để phát triển tiếp”.
