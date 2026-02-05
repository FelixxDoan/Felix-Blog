---
title: "Building a Container-as-a-Service from Scratch: Architecture, Implementation, and Real-World Lessons"
pubDate: 2026-02-03
description: "From a thesis project to a practical CaaS platform: architecture, engineering decisions, challenges, and lessons learned."
lang: "en"
tags: ["docker", "caas", "gateway", "traefik", "microservices", "jwt", "redis", "minio", "postgres", "mongodb"]
---



**Author:** Felix Doan  
**Repository:** https://github.com/FelixxDoan/Container-as-a-Service

---

## 1. TL;DR

Container-as-a-Service (CaaS) is a model that allows users to create, manage, and operate containers through an API or a control layer, instead of interacting directly with Docker or the underlying infrastructure.

In this article, I share my experience building a basic yet functional CaaS platform—from architectural design and technology choices to implementing core capabilities such as authentication, container lifecycle management, request routing, and data persistence.

Although the project originated as a graduation thesis, my goal went beyond academic requirements. I aimed to build a system that actually runs, supports multiple users within the same network environment, enforces access control, and remains extensible for future improvements.

This post is written for developers who want to understand how a CaaS system works in practice—especially those with a backend/system background interested in Docker-based platforms.

---

## 2. Background & Motivation

This project started as part of my academic work, but the motivation came from a very practical problem: learning environments are almost never consistent across students.

In many backend/system courses, each student sets up their own stack locally. That creates countless variables—different operating systems, different dependency versions, missing permissions, port conflicts, and so on. As the class grows, support becomes expensive. Students also spend more time fixing setup issues than learning the actual subject.

At first, I considered simple approaches such as providing virtual machines or writing a “perfect Docker setup guide.” But the deeper I went, the clearer it became: the real bottleneck wasn’t the tooling—it was **how environments are provisioned, managed, and operated**.

That’s why I decided to build a system where each user can be assigned an isolated, container-based environment, managed centrally through APIs. Docker became the core, not just for packaging, but as the foundation for a controlled and reproducible learning platform.

---

## 3. Problem Statement

Before picking technologies, I defined the real-world pain points the system should address:

- **Inconsistent environments:** the same exercise behaves differently across machines, making debugging and support difficult.
- **Limited scalability:** manual provisioning (or VM-heavy workflows) doesn’t scale as user count grows.
- **Weak security boundaries and access control:** roles such as Admin/Teacher/Student need clear separation and resource isolation.
- **Lack of operational visibility:** it’s hard to know who is running what, which containers are alive, and how resources are being used.
- **High operational cost:** traditional approaches require repeated setup and ongoing maintenance.

In short, I needed a platform that could **automate container provisioning, manage lifecycles, isolate users**, and remain operable within a local/internal network scope.

---

## 4. Goals & Scope

### Goals

This project aims to:

- Provide isolated container-based environments for individual users.
- Support multiple roles: **Admin / Teacher / Student**.
- Enforce authentication and authorization at the platform level.
- Combine theory and hands-on practice within the same system.
- Keep deployment and operations manageable within a **LAN/internal network** environment.

### Non-goals

To stay focused, I intentionally excluded:

- Building a full orchestration platform like Kubernetes.
- Production-grade autoscaling or large-scale resource optimization.
- Multi-tenant public cloud deployments.
- Complex billing/quota systems.

These boundaries helped me focus on the “spine” of a CaaS platform: **auth → provisioning → routing → storage → lifecycle**.

---

## 5. High-Level Architecture

The system follows a lightweight microservices-style architecture with these main components:

- **Frontend:** the UI for teachers and students.
- **API Gateway:** the single entry point; validates tokens and routes requests to the right service.
- **Auth Service:** handles login and issues JWTs.
- **User Service:** stores user metadata and role information.
- **Class Service:** manages classes/subjects and the container lifecycle.
- **Data & storage layer:** MongoDB, PostgreSQL, Redis, and MinIO.
- **Reverse proxy / routing:** Traefik routes traffic to containers based on labels.

### End-to-end request flow

1. The user logs in from the frontend.
2. The gateway forwards the request to Auth Service and receives a JWT.
3. Every subsequent request goes through the gateway; the gateway verifies the JWT before forwarding.
4. When a student joins a class, Class Service provisions a container via the Docker API.
5. Traefik reads runtime labels and routes traffic to the correct student container.
6. Files/artifacts are stored in MinIO; business data goes to Mongo/Postgres; sessions/caching live in Redis.

A key design priority here is **clear separation of responsibilities**, so debugging and future changes remain manageable.

---

## 6. Tech Stack & Design Decisions

Here are the key choices and why they made sense for this scope:

- **Frontend (Vite):** lightweight and fast for development, with a clean separation from backend concerns (no need for SSR/fullstack here).
- **JWT:** fits a stateless gateway model where each request can be verified. I apply a “zero-trust” mindset at the gateway: no valid token, no forwarding.
- **Redis (single-session enforcement):** I wanted one active session per user. Redis acts as a fast session registry; if a user is already active, subsequent logins can be rejected.
- **MongoDB:** flexible storage for evolving data like user metadata and class configurations.
- **PostgreSQL:** reliable relational storage for strongly constrained data such as assignments and results.
- **MinIO:** object storage for user-generated files (zip/source/report/etc.) without overloading the database.
- **Traefik:** dynamic reverse proxy routing to containers based on labels—very suitable for user-specific containers created at runtime.

Looking back, the hardest part wasn’t choosing tools—it was ensuring the pieces work together: auth, routing, storage, and lifecycle must align.

---

## 7. Quick Start (Refer to README)

Detailed setup commands and configuration live in the repository README. In this post, Quick Start is intentionally minimal so the focus stays on engineering decisions.

```bash
git clone <repo>
cd <repo>
# see README for a quick demo
