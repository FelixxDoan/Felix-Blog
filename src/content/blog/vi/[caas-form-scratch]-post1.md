---
title: "[CaaS from Scratch] Xây dựng Container Orchestrator tối giản: Nối Node.js với Docker Runtime"
pubDate: 2026-02-12
heroImage: "../_shared/caas-from-scratch/post1/hero.png"
description: "Thiết kế một orchestrator thu nhỏ bằng Node.js + Docker: provisioning theo yêu cầu, cô lập, routing động và chiến lược lưu trữ."
lang: "vi"
tags: ["caas", "docker", "nodejs", "dockerode", "traefik", "redis", "minio", "orchestrator", "monorepo", "pnpm"]
---

**Tác giả:** Felix Doan  
**Repo:** https://github.com/FelixxDoan/Container-as-a-Service

---

> Xây dựng hệ thống điều phối container (CaaS) có khả năng cấp phát môi trường thực thi cô lập (Isolated Runtime) và định tuyến động (Dynamic Routing) cho lớp học quy mô lớn.

## 1. Tóm tắt (TL;DR)

Bài viết này phân tích quá trình thiết kế và hiện thực hóa một hệ thống Container-as-a-Service (CaaS) thu nhỏ. Khác với các ứng dụng CRUD thông thường, thách thức chính của dự án nằm ở việc xây dựng cơ chế **Programmatic Provisioning** (cấp phát hạ tầng bằng code) để tạo ra các **On-demand Environments** theo yêu cầu.

Hệ thống được thiết kế để giải quyết 4 bài toán lõi của một orchestrator:

- **Isolation:** Cô lập hoàn toàn network và tài nguyên giữa các user container.
- **Lifecycle Management:** Điều khiển vòng đời container thông qua Node.js và Docker Socket.
- **Data Persistence:** Đảm bảo dữ liệu người dùng được lưu trữ an toàn ngay cả khi container bị hủy.
- **Service Discovery:** Tự động phát hiện và định tuyến traffic đến đúng container vừa sinh ra bằng Traefik.

## 2. Bài toán hệ thống (The Engineering Problem)

Trong môi trường giáo dục công nghệ, việc cho phép sinh viên nộp và chạy code (Remote Code Execution - RCE) luôn tiềm ẩn rủi ro bảo mật và vận hành lớn. Bài toán không chỉ đơn giản là “chạy code”, mà là chạy code theo cách **kiểm soát được**:

- **Rủi ro tài nguyên (Noisy Neighbor):** Nếu chạy trực tiếp trên server vật lý, một đoạn code lỗi (ví dụ: vòng lặp vô hạn) hoặc độc hại có thể chiếm dụng CPU/RAM và làm gián đoạn dịch vụ của hàng trăm sinh viên khác.
- **Sự thiếu đồng nhất môi trường:** Sinh viên dùng nhiều hệ điều hành và runtime khác nhau. Khi lớp lớn dần, debug môi trường thủ công sẽ nhanh chóng “vỡ trận”.
- **Nhu cầu cô lập:** Hệ thống cần khả năng cấp phát tài nguyên độc lập cho từng phiên làm việc; sinh viên A không được phép can thiệp vào process hay dữ liệu của sinh viên B.

Mục tiêu là xây dựng một lớp hạ tầng trung gian (Infrastructure Layer) có tính chất **Ephemeral** (sinh ra khi cần và hủy ngay khi xong) và **Sandboxed** (cô lập theo thiết kế).

## 3. Phạm vi dự án & những thứ không làm (Scope & Non-Goals)

Để rõ ràng về mặt kỹ thuật: **đây không phải là Kubernetes**. Mục tiêu không phải tái tạo lại K8s, mà là xây dựng một orchestrator tối giản (minimalist) phù hợp cho bài toán cụ thể.

Hệ thống tập trung vào: provisioning runtime theo request, isolation mức thực dụng (network/resource), và routing động.

Các hạng mục **không** triển khai ở giai đoạn này:

- **Autoscaling phức tạp:** Không tự động scale node khi tải tăng đột biến như K8s.
- **Multi-node scheduling:** Phiên bản hiện tại ưu tiên chạy trên single-node cluster mạnh mẽ thay vì phân tán nhiều node.
- **Production-grade observability:** Chưa ưu tiên monitoring/policy chuyên sâu trong MVP.

## 4. Kiến trúc hệ thống (System Architecture)

Hệ thống được chia thành 2 tầng rõ rệt để đảm bảo tính ổn định và bảo mật (Separation of Concerns).

### 4.1. Control Plane (Tầng điều khiển)

Đây là “bộ não” của hệ thống, nơi xử lý logic nghiệp vụ và ra lệnh cho hạ tầng. Tầng này bao gồm các microservices giao tiếp qua REST API:

- **Gateway:** Cổng vào thống nhất. Thực hiện xác thực (AuthN), kiểm tra quyền (AuthZ) và định tuyến request nội bộ đến các service đích.
- **Auth Service & User Service:** Quản lý danh tính, JWT token và phân quyền người dùng/vai trò (Role-based Access Control).
- **Class Service (The Orchestrator):** “Trái tim” của hệ thống. Chứa orchestration logic và gọi xuống Docker Daemon để tạo (provision), quản lý và thu hồi (teardown) runtime cho sinh viên.

### 4.2. Data Plane (Tầng runtime)

Nơi code của sinh viên thực sự được thực thi:

- **User Containers:** Các container (Ubuntu, Node.js, Python...) được sinh ra theo từng session làm bài.
- **Tính chất Ephemeral:** Chỉ tồn tại trong phiên làm việc; khi kết thúc phiên sẽ bị hủy hoàn toàn để giải phóng tài nguyên.
- **Storage strategy:** Dùng cơ chế **Asynchronous Upload**. Dữ liệu nằm trong container trong suốt phiên làm việc (tối ưu I/O) và chỉ đồng bộ lên MinIO (S3 Compatible) khi kết thúc phiên.

## 5. Chiến lược phát triển: Monorepo & Microservices

Đây là một quyết định kỹ thuật quan trọng giúp quản lý độ phức tạp của hệ thống phân tán.

Dự án tuy chia thành nhiều microservices nhưng chia sẻ rất nhiều logic nền tảng: helper, middleware xác thực, định nghĩa types, cấu hình Docker/Redis. Thay vì copy-paste (dễ gây “code drift”), mình dùng kiến trúc **Monorepo** kết hợp **pnpm workspaces**.

Cấu trúc workspace:

```yaml
packages:
  - "apps/*"      # Chứa các service chính (Gateway, Auth, Class...)
  - "packages/*"  # Chứa code dùng chung (Utils, DB configs...)
```

Lợi ích kỹ thuật:

- **Code reusability:** Ví dụ, logic xác thực JWT (`verifyJwt`) hay định dạng lỗi chuẩn (`httpError`) được đóng gói tại `packages/utils`. Các service chỉ cần import lại để dùng: `import { verifyJwt } from "@caas/utils/auth"`.
- **Consistency:** Toàn bộ hệ thống dùng chung chuẩn format lỗi, phiên bản thư viện và cách implement cho các concept quan trọng.
- **Simplified CI/CD:** Build/test trên toàn workspace giúp phát hiện lỗi tích hợp sớm.

## 6. Thách thức kỹ thuật cốt lõi (Core Challenges)

### 6.1. Docker-in-Node.js & race conditions

Gọi Docker CLI từ code (ví dụ dùng `exec`) thường thiếu ổn định và khó quản lý lỗi.

- **Giải pháp:** Sử dụng `dockerode` để giao tiếp trực tiếp với Docker Daemon qua Unix Socket (`/var/run/docker.sock`). Cách này giúp Node.js kiểm soát luồng tạo/xóa container theo hướng programmatic.
- **Xử lý tranh chấp:** Khi nhiều sinh viên bắt đầu bài thi cùng lúc, dùng **Redis Distributed Lock** để điều phối, tránh Docker Daemon bị quá tải bởi burst request đồng thời.

### 6.2. Data lifecycle management (Quản lý vòng đời dữ liệu)

Với đặc thù container “dùng xong xóa”, thách thức là giữ lại bài làm của sinh viên.

- **Giải pháp:** **Post-session exfiltration** (thu thập dữ liệu cuối phiên).
  - **Trong phiên:** dữ liệu ghi vào volume/container filesystem.
  - **Kết thúc phiên (logout/timeout):** Class Service kích hoạt pipeline: nén source code/log → upload MinIO → cập nhật database → xóa container.

### 6.3. Dynamic routing (Định tuyến động)

Mỗi container sinh ra có IP nội bộ ngẫu nhiên. Frontend cần một cách truy cập ổn định.

- **Giải pháp:** Thay vì Nginx tĩnh, dùng **Traefik**. Traefik lắng nghe sự kiện Docker và tự cập nhật routing table khi container vừa khởi động dựa trên **labels** gắn vào container.

## 7. Implementation highlight: Điều khiển Docker bằng code

Đoạn code dưới đây minh họa cách Class Service tạo một môi trường thi cô lập, đồng thời cấu hình sẵn Traefik bằng labels:

```js
// apps/class-api/src/utils/docker.js (Simplified)
export const createStudentContainer = async (studentId, networkName) => {
  const containerName = `student-${studentId}`;

  // Define labels for Traefik discovery
  const labels = {
    "traefik.enable": "true",
    // Dynamic routing: requests to /api/r/{id} will be forwarded to this container
    [`traefik.http.routers.${containerName}.rule`]: `PathPrefix(\`/api/r/${studentId}\`)`,
    [`traefik.http.services.${containerName}.loadbalancer.server.port`]: "3000",
    "com.caas.owner": String(studentId), // Custom metadata
  };

  // Programmatic provisioning
  const container = await docker.createContainer({
    Image: "micro-node-base:prod",
    name: containerName,
    Labels: labels,
    HostConfig: {
      NetworkMode: networkName,          // Network isolation
      Memory: 512 * 1024 * 1024,         // Hard limit: 512MB RAM
      NanoCpus: 1_000_000_000,           // Hard limit: 1 CPU core
    },
  });

  await container.start();
  return { id: container.id, hostname: containerName };
};
```

### Phân tích cấu hình

**Service discovery (Traefik labels)**

- `traefik.http.routers...rule`: định nghĩa routing động. Request vào `/api/r/{studentId}` sẽ được Traefik forward vào đúng container của sinh viên đó.
- `loadbalancer.server.port`: chỉ định cổng nội bộ (3000) mà app Node.js trong container đang lắng nghe.

**Resource quotas**

Để xử lý bài toán “Noisy Neighbor”, giới hạn cứng được thiết lập ngay lúc provisioning:

- `Memory: 512MB` và `NanoCpus: 1.0` — nếu code bị memory leak hoặc loop, chỉ container đó bị kill/crash; host và các container khác vẫn an toàn.

**Network isolation**

- `NetworkMode`: mỗi nhóm container (theo lớp/bài thi) đặt trong một bridge network riêng, giảm nguy cơ sinh viên scan network để truy cập trái phép service của người khác.

## 8. Các quyết định kỹ thuật & đánh đổi (Tech Stack & Trade-offs)

- **Node.js:** Non-blocking I/O, phù hợp để xử lý hàng loạt request gọi Docker API (network-latency bound) mà không chặn main thread.
- **Redis:** Session store có TTL, giúp tự động dọn dẹp session “zombie” nếu user thoát đột ngột.
- **Traefik:** Native Docker support + hot-reload route, rất phù hợp cho hệ thống dynamic.

## 9. Bài học & hướng phát triển (Retrospective)

Xây dựng hệ thống này giúp mình hiểu rõ một điều: **code chạy được là chưa đủ — code phải vận hành được hạ tầng một cách an toàn và dự đoán được.**

Phiên bản hiện tại đã chạy được luồng end-to-end: user đăng nhập → cấp phát container → routing động → thu hồi & lưu trữ dữ liệu → teardown container.

Các điểm cần cải thiện:

- **Bảo mật:** Việc mount `/var/run/docker.sock` vào container Class API mang rủi ro (gần như quyền root trên host). Trong phạm vi MVP, đây là đánh đổi chấp nhận được để giảm độ phức tạp triển khai.

Hướng đi tương lai:

- Chuyển sang giao tiếp Docker TCP Socket có bảo mật (TLS).
- Nâng cấp lên Kubernetes để tận dụng khả năng self-healing của pods thay vì tự quản lý vòng đời bằng code thủ công.
