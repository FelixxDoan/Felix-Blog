---
title: "Xây dựng Container-as-a-Service từ đầu: Thiết kế, triển khai và những bài học thực tế"
pubDate: 2026-02-03
description: "Từ đồ án tốt nghiệp đến một hệ thống CaaS chạy được: kiến trúc, quyết định kỹ thuật, thách thức và bài học."
lang: "vi"
slug: "build-caas-from-scratch"
tags: ["docker", "caas", "gateway", "traefik", "microservices", "jwt", "redis", "minio", "postgres", "mongodb"]
---

# Xây dựng Container-as-a-Service từ đầu: Thiết kế, triển khai và những bài học thực tế

**Tác giả:** Felix Doan  
**Repo:** https://github.com/FelixxDoan/Container-as-a-Service

---

## 1. Tóm tắt (TL;DR)

Container-as-a-Service (CaaS) là mô hình cho phép người dùng tạo, quản lý và vận hành container thông qua API hoặc một lớp trung gian, thay vì phải thao tác trực tiếp với Docker hay hạ tầng bên dưới.

Trong bài viết này, tôi chia sẻ quá trình xây dựng một hệ thống Container-as-a-Service hoàn chỉnh ở mức cơ bản: từ thiết kế kiến trúc, lựa chọn công nghệ, đến triển khai các chức năng cốt lõi như xác thực người dùng, quản lý vòng đời container, routing request và lưu trữ dữ liệu.

Dự án được phát triển từ một đồ án tốt nghiệp, nhưng mục tiêu của tôi không chỉ là hoàn thành yêu cầu học thuật. Tôi hướng tới việc xây dựng một hệ thống **có thể chạy thực tế**, hỗ trợ nhiều người dùng trong cùng một môi trường mạng, có phân quyền, có bảo mật và đủ rõ ràng để mở rộng trong tương lai.

Bài viết phù hợp với những bạn mới muốn hiểu CaaS hoạt động như thế nào, và cả những developer đã có kiến thức nền về backend + Docker muốn tham khảo cách tiếp cận khi xây dựng một hệ thống CaaS từ đầu.

---

## 2. Bối cảnh & động lực

Dự án này bắt đầu từ một đồ án trong quá trình học của tôi, nhưng động lực thật sự đến từ một vấn đề “rất đời”: môi trường thực hành của sinh viên gần như không bao giờ đồng nhất.

Trong nhiều môn học backend/hệ thống, việc mỗi sinh viên tự cài đặt stack trên máy cá nhân dẫn đến hàng loạt biến số: hệ điều hành khác nhau, phiên bản thư viện khác nhau, thiếu quyền hệ thống, xung đột port… Khi số lượng sinh viên tăng, việc hỗ trợ trở nên cực kỳ tốn thời gian. Sinh viên cũng mất nhiều thời gian “fix môi trường” hơn là học nội dung.

Ban đầu, tôi nghĩ đến các giải pháp như cung cấp VM hoặc viết tài liệu cài đặt Docker thật kỹ. Nhưng càng làm, tôi càng thấy điểm nghẽn không nằm ở công cụ, mà nằm ở **cách cấp phát – quản lý – vận hành môi trường thực hành**.

Từ đó tôi quyết định xây dựng một hệ thống dùng Docker làm lõi, cho phép cấp phát môi trường học tập dưới dạng container cho từng người dùng, được quản lý tập trung qua API. Đây là lý do dự án Container-as-a-Service ra đời.

---

## 3. Vấn đề cần giải quyết

Trước khi chọn công nghệ, tôi xác định rõ những “pain points” mà hệ thống cần xử lý:

- **Không đồng nhất môi trường học tập:** cùng một bài nhưng mỗi máy chạy một kiểu, khó debug và khó hướng dẫn.
- **Khó mở rộng quy mô:** khi số lượng người dùng tăng, việc tạo/quản lý môi trường thủ công gần như không khả thi.
- **Thiếu ranh giới bảo mật & phân quyền:** cần tách rõ quyền Admin / Teacher / Student và giới hạn truy cập tài nguyên.
- **Thiếu khả năng quan sát (observability) và vận hành:** không biết ai đang chạy gì, container nào sống/chết, tài nguyên dùng bao nhiêu.
- **Chi phí triển khai và bảo trì cao:** VM hoặc setup thủ công thường tốn thời gian, khó tái sử dụng, khó chuẩn hoá.

Tóm lại, tôi cần một hệ thống có thể **tự động cấp phát container, quản lý vòng đời, cô lập người dùng**, và đủ “dễ vận hành” trong phạm vi một nền tảng học tập.

---

## 4. Mục tiêu & phạm vi

### Mục tiêu

Dự án hướng tới:

- Cung cấp môi trường học tập/làm bài **riêng biệt cho từng người dùng** thông qua container.
- Quản lý người dùng và vai trò: **Admin / Teacher / Student**.
- Xác thực và phân quyền rõ ràng để giảm rủi ro truy cập sai.
- Tích hợp học lý thuyết và thực hành trong cùng một hệ thống.
- Tối ưu trải nghiệm triển khai trong phạm vi **mạng nội bộ (LAN)** hoặc môi trường tương tự.

### Giới hạn (Non-goals)

Để tránh ôm đồm, tôi chủ động không hướng tới:

- Xây dựng orchestration “đủ đầy” như Kubernetes.
- Autoscaling production-grade hoặc tối ưu tài nguyên ở quy mô lớn.
- Multi-tenant trên public cloud.
- Billing/quota phức tạp.

Việc đặt giới hạn giúp tôi tập trung vào “xương sống” của một hệ thống CaaS: **auth → provisioning → routing → storage → lifecycle**.

---

## 5. Kiến trúc tổng quan

Hệ thống được thiết kế theo hướng microservices (mức cơ bản), gồm các thành phần chính:

- **Frontend:** giao diện cho Teacher và Student thao tác.
- **API Gateway:** điểm vào duy nhất, chịu trách nhiệm xác thực token và forward request đúng service.
- **Auth Service:** đăng nhập, phát hành JWT.
- **User Service:** quản lý metadata người dùng và vai trò.
- **Class Service:** quản lý lớp học/môn học và vòng đời container.
- **Hệ dữ liệu & storage:** MongoDB, PostgreSQL, Redis, MinIO.
- **Reverse proxy / routing:** Traefik để route traffic đến container dựa trên label.

### Flow request cơ bản (một vòng end-to-end)

1. User đăng nhập từ frontend.
2. Gateway chuyển request sang Auth Service để xác thực và trả JWT.
3. Mọi request sau đó đều đi qua Gateway, Gateway verify JWT rồi mới forward.
4. Student tham gia lớp học → Class Service gọi Docker API để tạo container theo cấu hình môn học.
5. Traefik đọc label và route traffic đến đúng container của student.
6. Bài làm/file sinh ra được lưu vào MinIO; dữ liệu nghiệp vụ lưu vào Mongo/Postgres; session/cache lưu Redis.

Điểm tôi ưu tiên khi thiết kế là: **tách trách nhiệm rõ ràng**, để khi debug hoặc mở rộng, tôi biết “vấn đề nằm ở lớp nào”.

---

## 6. Công nghệ & lý do chọn

Dưới đây là một số quyết định chính và lý do:

- **Frontend (Vite):** tôi chọn Vite vì nhẹ, dev nhanh, tách frontend khỏi backend rõ ràng (không cần SSR/Fullstack như Next.js trong phạm vi này).
- **JWT:** phù hợp mô hình stateless, Gateway có thể verify token trên từng request. Tôi áp dụng tư duy “zero-trust” ở lớp gateway: request không có token hợp lệ thì không forward.
- **Redis (single-session):** tôi muốn mỗi user chỉ có **1 phiên đăng nhập hoạt động**. Redis dùng để lưu session state nhanh; nếu user đã active, login lần sau bị từ chối.
- **MongoDB:** lưu các dữ liệu linh hoạt như user metadata, cấu hình lớp/môn, schema thay đổi dễ.
- **PostgreSQL:** dùng cho dữ liệu có ràng buộc chặt như bài tập, kết quả, quan hệ rõ ràng.
- **MinIO:** object storage phù hợp lưu file bài làm đủ định dạng (zip, source code, report…), tách khỏi database.
- **Traefik:** reverse proxy route traffic dựa vào label container, rất hợp khi container được tạo động theo từng user.

Nhìn lại, phần “chọn công nghệ” không khó bằng phần “đảm bảo các mảnh ghép phối hợp đúng”: auth, routing, storage và lifecycle phải khớp nhau.

---

## 7. Quick Start (tham chiếu README)

Phần lệnh chạy chi tiết và cấu hình nằm trong README của repo. Trong blog, tôi giữ Quick Start ở mức “định hướng” để người đọc hiểu: clone repo → chạy demo → xem flow.

```bash
git clone <repo>
cd <repo>
# xem README để chạy demo nhanh
