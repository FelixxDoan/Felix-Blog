---
title: "[CaaS from Scratch] Designing a Lightweight Container Orchestrator: From Node.js to Docker Runtime"
pubDate: 2026-02-12
heroImage: '../_shared/caas-from-scratch/post1/hero.png'
description: "Designing a minimalist orchestrator with Node.js + Docker: on-demand provisioning, isolation, dynamic routing, and a practical storage strategy."
lang: "en"
tags: ["caas", "docker", "nodejs", "dockerode", "traefik", "redis", "minio", "orchestrator", "monorepo", "pnpm"]
---

**Author:** Felix Doan  
**Repo:** https://github.com/FelixxDoan/Container-as-a-Service

---

> Building a Container-as-a-Service (CaaS) orchestrator capable of provisioning isolated runtimes and performing dynamic routing for large-scale classrooms.

## 1. Summary (TL;DR)

This post walks through the design and implementation of a compact Container-as-a-Service (CaaS) platform. Unlike typical CRUD systems, the core challenge here is **programmatic provisioning**—creating isolated execution environments **on demand** through code.

The system is designed to solve four fundamental problems that any orchestrator must handle:

- **Isolation:** Fully isolate network and resources between user containers.
- **Lifecycle Management:** Manage container lifecycle via Node.js and the Docker socket.
- **Data Persistence:** Preserve user data safely even when containers are destroyed.
- **Service Discovery:** Auto-discover newly created containers and route traffic to them via Traefik.

## 2. The Engineering Problem

In technology education, allowing students to submit and run code (Remote Code Execution – RCE) always introduces significant security and operational risks. The problem is not simply “run code”, but **run code in a controlled way**:

- **Resource risk (“Noisy Neighbor”):** If code runs directly on a physical server, a buggy (e.g., infinite loop) or malicious program can consume CPU/RAM and disrupt service for hundreds of other students.
- **Environment inconsistency:** In lab classes, students use different operating systems and runtime versions. As the class grows, manual environment debugging becomes unscalable.
- **Isolation requirement:** The platform must allocate independent resources per session. Student A must not be able to access processes or data belonging to Student B.

The goal is to build an intermediate **infrastructure layer** that is **ephemeral** (created when needed, destroyed when done) and **sandboxed** (isolated by design).

## 3. Project Scope & Non-Goals

To be technically explicit: **this is not Kubernetes**. The purpose isn’t to recreate K8s, but to build a minimal orchestrator tailored to a specific use case.

- **We focus on:** On-demand runtime provisioning, practical isolation (network/resource), and dynamic routing.
- **We do NOT implement:**
  - **Complex autoscaling:** No node autoscaling for sudden traffic spikes like Kubernetes.
  - **Multi-node scheduling:** Current version targets a powerful single-node cluster rather than a distributed multi-node system.
  - **Production-grade observability:** Deep monitoring/policy is not prioritized in this stage.

## 4. System Architecture

The system is split into two distinct layers to maintain stability and security through separation of concerns:

### 4.1. Control Plane

This is the “brain” of the system, responsible for business logic and infrastructure commands. It consists of microservices communicating over REST APIs:

- **Gateway:** A unified entry point. Handles authentication (AuthN), authorization (AuthZ), and internal routing to downstream services.
- **Auth Service & User Service:** Manage identity, JWT tokens, and role-based access control (RBAC).
- **Class Service (The Orchestrator):** The heart of the system. It contains orchestration logic—provisioning, managing, and tearing down student runtimes by calling the Docker daemon.

### 4.2. Data Plane (Runtime Layer)

Where student code is actually executed:

- **User Containers:** Containers (Ubuntu, Node.js, Python, …) created per working session.
- **Ephemeral by nature:** Containers exist only during the session, then are destroyed to free resources.
- **Storage strategy:** Uses **asynchronous upload**. Data stays inside the container during the session (fast I/O) and is synchronized to MinIO (S3-compatible) only when the session ends.

## 5. Development Strategy: Monorepo & Microservices

This was a key architectural choice to keep complexity under control.

Although the project is split into multiple microservices, they share a lot of foundational logic: helpers, auth middlewares, type definitions, and configs for Docker/Redis.

Instead of duplicating code (which leads to “code drift”), I used a **monorepo** architecture with **pnpm workspaces**.

Workspace structure:

```yaml
packages:
  - "apps/*"      # Main services (Gateway, Auth, Class...)
  - "packages/*"  # Shared code (Utils, DB configs...)
```

**Technical benefits:**

- **Code reusability:** For example, JWT verification (`verifyJwt`) and standardized error formatting (`httpError`) live in `packages/utils` and are reused across services via imports like:
  `import { verifyJwt } from "@caas/utils/auth"`.
- **Consistency:** All services share the same error format, library versions, and implementations for common concepts.
- **Simplified CI/CD:** Build and test can run across the whole workspace, catching integration issues earlier.

## 6. Core Technical Challenges

### 6.1. Docker-in-Node.js & Race Conditions

Calling the Docker CLI from code (e.g., via `exec`) is often unstable and hard to handle reliably.

- **Solution:** Use `dockerode` to talk directly to the Docker daemon through the Unix socket (`/var/run/docker.sock`). This enables true programmatic control over container creation/removal.
- **Contention control:** When many students start sessions at the same time, I used a **Redis distributed lock** to coordinate requests so the Docker daemon isn’t overwhelmed by concurrent bursts.

### 6.2. Data Lifecycle Management

With “create → use → destroy” containers, the challenge is preserving students’ work.

- **Solution:** **Post-session exfiltration**.
  - **During the session:** Data is written into the container volume.
  - **On session end (logout/timeout):** Class Service triggers a collection pipeline:
    compress source code/logs → upload to MinIO → update database → then delete container.

### 6.3. Dynamic Routing

Each newly created container gets a random internal IP. How does the frontend know where to call?

- **Solution:** Instead of static Nginx, I chose **Traefik**. Traefik watches Docker events and hot-updates routing rules when a container starts, based on Docker **labels** attached to that container.

## 7. Implementation Highlight: Controlling Docker via Code

The snippet below illustrates how the Class Service provisions an isolated exam environment and preconfigures Traefik routing via labels:

```js
// apps/class-api/src/utils/docker.js (Simplified)
export const createStudentContainer = async (studentId, networkName) => {
  const containerName = `student-${studentId}`;

  // Define Labels for Traefik Discovery
  const labels = {
    "traefik.enable": "true",
    // Dynamic routing: requests to /api/r/{id} will be forwarded to this container
    [`traefik.http.routers.${containerName}.rule`]: `PathPrefix(\`/api/r/${studentId}\`)`,
    [`traefik.http.services.${containerName}.loadbalancer.server.port`]: "3000",
    "com.caas.owner": studentId // Custom metadata
  };

  // Programmatic Provisioning
  const container = await docker.createContainer({
    Image: "micro-node-base:prod",
    name: containerName,
    Labels: labels,
    HostConfig: {
      NetworkMode: networkName,       // Network isolation
      Memory: 512 * 1024 * 1024,      // Hard limit: 512MB RAM
      NanoCpus: 1000000000            // Hard limit: 1 CPU core
    }
  });

  await container.start();

  return { id: container.id, hostname: containerName };
};
```

> What this configuration achieves

**Service discovery via Traefik labels**

Instead of hard-coding IPs, I use labels as the contract with Traefik.

- `traefik.http.routers...rule`: defines a dynamic routing rule. Any request hitting `/api/r/{studentId}` is automatically forwarded to that student’s container.
- `loadbalancer.server.port`: points Traefik to the internal port (3000) where the Node.js app listens.

**Resource quotas**

To address “Noisy Neighbor” (Section 2), I enforce **hard limits** at provisioning time:

- `Memory: 512MB` and `NanoCpus: 1.0` — if a student’s code leaks memory or loops forever, only that container gets killed; the host and other containers remain safe.

**Network isolation**

- `NetworkMode`: each group of containers (per class/exam) is placed into its own dedicated bridge network. This prevents student A from scanning the network and attempting to reach other students’ services or internal infrastructure.

## 8. Tech Stack & Trade-offs

- **Node.js:** Chosen for non-blocking I/O—ideal for handling many Docker API calls (network-latency bound) without blocking the main thread.
- **Redis:** Used as a TTL-based session store to automatically clean up “zombie” sessions if users disconnect unexpectedly.
- **Traefik:** Selected for native Docker integration and hot-reload routing—crucial for a dynamic system.

## 9. Retrospective & Next Steps

Building this system taught me something very practical:

**Code that “works” is not enough—code must operate infrastructure safely and predictably.**

The current version already supports an end-to-end flow:
user login → container provisioning → dynamic routing → data collection + storage → container teardown.

There are still areas to improve:

- **Security risk:** Mounting `/var/run/docker.sock` into the Class API container is dangerous (effectively root access on the host). Within the MVP scope, this was an acceptable trade-off to reduce deployment complexity.

Future directions:

- Move to a secured Docker TCP socket (TLS).
- Upgrade to Kubernetes to leverage pod self-healing instead of manually managing container lifecycles in application code.
