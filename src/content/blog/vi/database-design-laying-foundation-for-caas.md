---
title: "Database Design – Đặt nền móng dữ liệu cho CaaS (MVP, Microservices, Least-Privilege)"
pubDate: 2026-02-09
heroImage: "../_shared/caas-database-design/hero.png"
description: "Vì sao tôi chọn MongoDB ở giai đoạn MVP, cách chia data ownership theo microservices, và quyết định tách User khỏi Teacher/Student để giữ ranh giới auth vs domain."
lang: "vi"
tags: ["caas", "database-design", "mongodb", "microservices", "auth", "rbac", "least-privilege", "schema-design"]
---

**Tác giả:** Felix Doan  
**Repo:** https://github.com/FelixxDoan/Container-as-a-Service  

---

## 1. Tóm tắt (TL;DR)

Ở bài trước tôi đã trình bày tổng quan dự án CaaS. Trong bài này, tôi bắt đầu phần kỹ thuật bằng **thiết kế database** — không phải vì database “khó nhất”, mà vì trong hệ thống backend theo hướng microservices, cách tổ chức dữ liệu gần như định hình toàn bộ phần phía trên: API design, auth flow, service boundary, cách debug và khả năng mở rộng về sau.

Ở giai đoạn hiện tại, mục tiêu **không** phải tối ưu production/scale lớn. Tôi tập trung vào một nền tảng dữ liệu:

- **Rõ ràng, dễ hiểu**
- **Dễ seed data để phát triển tính năng**
- **Đủ dùng cho use-case hiện tại**
- Và quan trọng nhất: **không over-engineering**

---

## 2. Bối cảnh & mục tiêu

Dự án CaaS được thiết kế theo mô hình microservices (mức cơ bản), với các service chính:

- **Auth**: xử lý xác thực (credentials, token)
- **User**: quản lý tài khoản và role
- **Class**: dữ liệu lớp học/môn học/đăng ký học
- **Gateway**: entrypoint, định tuyến request và kiểm soát truy cập

Ba nhóm người dùng chính: **Admin / Teacher / Student**.

Với cách chia này, database không chỉ là nơi “lưu data”, mà là thứ quyết định:

- Service nào sở hữu dữ liệu gì
- Ranh giới quyền truy cập (least privilege)
- Luồng dữ liệu (data flow) khi user thao tác
- Mức độ coupling giữa các domain

---

## 3. Những quyết định thiết kế ban đầu

### 3.1. Vì sao tôi chọn MongoDB (ở giai đoạn MVP)

Ở giai đoạn MVP, domain còn thay đổi, quan hệ dữ liệu chưa quá phức tạp và chưa có nhu cầu transaction cross-domain nặng. Vì vậy tôi chọn **MongoDB** làm datastore chính cho metadata và domain data.

Lý do thực tế:

- Linh hoạt schema → dễ thử nghiệm, đổi hướng nhanh
- Dễ seed data và “đẩy” tính năng lên sớm
- Tránh bị “đóng cứng” schema quá sớm (thường làm chậm tốc độ phát triển)

Tôi không phủ nhận điểm mạnh của relational database (ràng buộc chặt, transaction mạnh), nhưng với mục tiêu hiện tại, MongoDB giúp tôi tập trung vào luồng nghiệp vụ và kiến trúc tổng thể trước.

---

## 4. Data ownership trong kiến trúc microservices

Một nguyên tắc tôi cố giữ ngay từ đầu:

> **Service nào chịu trách nhiệm nghiệp vụ thì service đó sở hữu dữ liệu (data ownership).**

Trong CaaS:

- **Auth service**: dữ liệu xác thực (credentials, token-related)
- **User service**: thông tin tài khoản và role
- **Class service**: lớp học, môn học, đăng ký học

Lợi ích của cách chia này:

- Service boundary rõ ràng → dễ phát triển/đổi độc lập
- Giảm coupling giữa domain
- Debug và mở rộng dễ hơn

Song song đó, tôi áp dụng nguyên tắc **least privilege**: mỗi service chỉ truy cập phần dữ liệu tối thiểu nó cần.

---

## 5. User, Teacher và Student: tách hay gộp?

Một câu hỏi tôi phải trả lời khá sớm:

- **Một User duy nhất** phân biệt bằng role?
- Hay **tách collection riêng** cho từng loại người dùng?

Cuối cùng, tôi chọn cách tách rõ hai khái niệm:

- **User** = account/identity (đăng nhập + phân quyền)
- **Teacher / Student** = domain entity (hồ sơ nghiệp vụ)

Vì sao?

- Auth/User service chỉ nên chạm vào dữ liệu tài khoản
- Service nghiệp vụ không cần (và không nên) truy cập dữ liệu auth nhạy cảm
- Ranh giới quyền truy cập rõ hơn, đúng tinh thần least privilege

Trade-off:

- Tăng số lượng collection
- Cần quản lý reference giữa các entity

Nhưng đổi lại: trách nhiệm rõ ràng, dễ mở rộng về sau (phân công giảng dạy, reporting, đánh giá...).

---

## 6. Tổng quan data model (conceptual)

> Phần này trình bày “hình dạng dữ liệu” ở mức conceptual để làm rõ tư duy thiết kế, chưa đi sâu implementation.

### 6.1. User

```json
{
  "email": "string",
  "password": "hashed string",
  "role": "admin | teacher | student",
  "profileRef": "ObjectId",
  "profileType": "Teacher | Student",
  "passChange": "boolean",
  "isActive": "boolean"
}
```

**User** đại diện cho tài khoản đăng nhập và identity chung trong hệ thống. Tôi giữ model này ở mức tối giản, chỉ chứa dữ liệu cần cho auth và phân quyền.

- `profileRef` + `profileType`: liên kết User tới Teacher/Student tương ứng
- `passChange`: phục vụ seed data — user khởi tạo ban đầu buộc đổi mật khẩu lần đăng nhập đầu tiên (tăng bảo mật mà không làm phức tạp logic)

### 6.2. Teacher

```json
{
  "name": "string",
  "email": "string",
  "phone": "string",
  "refClasses": ["ObjectId"],
  "userRef": "ObjectId",
  "isActive": "boolean"
}
```

**Teacher** là domain entity cho nghiệp vụ giảng dạy, tách khỏi auth data.  
`userRef` liên kết ngược về User để xác định tài khoản tương ứng.

### 6.3. Student

```json
{
  "name": "string",
  "email": "string",
  "phone": "string",
  "refClasses": ["ObjectId"],
  "userRef": "ObjectId",
  "enrollmentDate": "date",
  "isActive": "boolean"
}
```

**Student** tương đồng Teacher nhưng có thêm `enrollmentDate` để theo dõi thời điểm nhập học và phục vụ các use-case quản lý quá trình học.

Tôi giữ cấu trúc Teacher/Student tương đối giống nhau có chủ đích: giảm độ phức tạp cho các logic chung, nhưng vẫn phản ánh đúng vai trò trong domain.

---

## 7. Trade-offs & constraints (tôi chủ động chấp nhận)

Thiết kế hiện tại đi kèm một số đánh đổi:

- Không có foreign key enforcement như SQL
- Chấp nhận eventual consistency giữa các service
- Chưa hỗ trợ multi-tenant
- Index mới ở mức cơ bản, chưa tối ưu cho analytics

Đây không phải “thiếu sót”, mà là những điểm tôi để dành cho các giai đoạn tiếp theo khi use-case rõ hơn.

---

## 8. Những điều tôi nhận ra khi làm

- Database design ảnh hưởng đến code nhiều hơn tôi nghĩ ban đầu.
- Tách auth-related data sớm giúp code gọn hơn và dễ test hơn về sau.
- Ở giai đoạn đầu, một schema “đủ dùng” thường mang lại tốc độ phát triển tốt hơn so với cố gắng xây một schema “hoàn hảo”.
- Nhiều vấn đề chỉ lộ ra khi bắt đầu seed data và viết API đầu tiên — điều đó là bình thường khi xây hệ thống thực tế.

---

## 9. Hạn chế

Ở thời điểm hiện tại, thiết kế database này còn một số hạn chế:

- Chưa có audit log
- Chưa có schema versioning
- Chưa hỗ trợ multi-tenant
- Chưa xử lý các use-case reporting phức tạp

---

## 10. Hướng phát triển tiếp theo

Khi nền tảng database đã tương đối ổn định, bước tiếp theo của tôi là “đưa data vào đời”:

- Mapping database với user flow thực tế
- Quan sát dữ liệu di chuyển giữa các service
- Làm rõ auth flow dựa trên schema hiện tại

Đây cũng là nội dung của bài tiếp theo trong series: **User Flow – hệ thống thực sự hoạt động ra sao khi có người dùng tương tác**.

---

## 11. Lời kết

Với tôi, thiết kế database không phải là đoán trước mọi thứ cho tương lai, mà là:

- Hiểu rõ vấn đề ở hiện tại
- Chấp nhận trade-off hợp lý
- Và để lại đủ không gian để hệ thống phát triển