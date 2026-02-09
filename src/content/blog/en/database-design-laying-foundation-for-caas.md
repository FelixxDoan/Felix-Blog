---
title: "Database Design – Laying the Data Foundation for CaaS (MVP, Microservices, Least Privilege)"
pubDate: 2026-02-09
heroImage: "../_shared/caas-database-design/hero.png"
description: "Why I chose MongoDB for the MVP, how I define data ownership in a microservices setup, and why I separate User from Teacher/Student to keep auth boundaries clean."
lang: "en"
tags: ["caas", "database-design", "mongodb", "microservices", "auth", "rbac", "least-privilege", "schema-design"]
---

**Author:** Felix Doan  
**Repo:** https://github.com/FelixxDoan/Container-as-a-Service  

---

## 1. Summary (TL;DR)

In the previous post, I shared a high-level overview of my CaaS project. This post kicks off the technical series with **database design**—not because databases are the “hardest” part, but because in a microservices-leaning backend, the way you structure data heavily shapes everything above it: API boundaries, auth flows, service responsibilities, debugging, and future scalability.

At this stage, my goal is **not** to optimize for large-scale production. Instead, I want a data foundation that is:

- **Clear and easy to reason about**
- **Easy to seed for rapid feature development**
- **Good enough for current use cases**
- And most importantly: **not over-engineered**

---

## 2. Context & goals

CaaS is structured as a basic microservices architecture with these key services:

- **Auth**: authentication concerns (credentials, tokens)
- **User**: accounts and roles
- **Class**: classes/courses/enrollment-related domain data
- **Gateway**: entrypoint, request routing, and access control

There are three primary user groups: **Admin / Teacher / Student**.

With this split, the database is not just “where data lives”—it determines:

- Which service owns which data
- How to enforce **least privilege**
- How data flows when users interact with the system
- How tightly (or loosely) domains are coupled

---

## 3. Early design decisions

### 3.1. Why MongoDB (for the MVP phase)

During the MVP phase, the domain is still evolving, relationships are not deeply complex yet, and I don’t need heavy cross-domain transactions. That’s why I chose **MongoDB** as the primary datastore for metadata and domain data.

Practical reasons:

- Flexible schema → faster iteration and easier pivots
- Simple seeding → ship features earlier
- Avoid “locking in” a rigid schema too early (which often slows development)

Relational databases have strong advantages (constraints, transactions), but for the current goals, MongoDB helps me focus on business flows and overall architecture first.

---

## 4. Data ownership in a microservices architecture

A principle I try to apply from day one:

> **The service that owns the business responsibility should own the data.**

In CaaS:

- **Auth service**: authentication data (credentials, token-related)
- **User service**: account and role data
- **Class service**: classes/courses/enrollments

Benefits of this approach:

- Clear service boundaries → independent evolution
- Reduced domain coupling
- Easier debugging and future refactoring

In parallel, I apply **least privilege**: each service should access only the minimum data it needs.

---

## 5. User vs Teacher/Student: split or unify?

A key early question:

- Should I model everything under a single **User** entity and differentiate by role?
- Or should I keep separate collections for each user type?

I chose to separate two concepts explicitly:

- **User** = account/identity (login + authorization)
- **Teacher / Student** = domain entities (business profiles)

Why?

- Auth/User services should only touch account-related data
- Domain services should not (and usually must not) access sensitive auth fields
- Clearer boundaries align better with least privilege

Trade-offs:

- More collections
- References to maintain between entities

But in return: clearer responsibilities and an easier path for future domain growth (teaching assignments, reporting, evaluation, etc.).

---

## 6. Conceptual data model overview

> This section describes the data shape at a conceptual level to explain the design intent, not an implementation contract.

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

**User** represents the login account and shared identity across the system. I keep it minimal—only what’s required for authentication and authorization.

- `profileRef` + `profileType`: links a User to the corresponding Teacher/Student profile
- `passChange`: supports seeded accounts—forcing a password change on first login improves security without complicating the core logic

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

**Teacher** is the domain entity for teaching-related workflows, separated from auth data.  
`userRef` links back to the associated User account.

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

**Student** is similar to Teacher but adds `enrollmentDate` to track admission timing and support school lifecycle use cases.

I intentionally keep Teacher/Student structures fairly similar to reduce complexity for shared logic, while still reflecting distinct domain needs.

---

## 7. Trade-offs & constraints (intentionally accepted)

This design comes with a few conscious trade-offs:

- No foreign key enforcement like SQL
- Eventual consistency across services is acceptable
- No multi-tenancy yet
- Indexing is basic, not optimized for analytics/reporting

These are not “bugs”—they’re deferred design points for later phases when requirements become clearer.

---

## 8. What I learned building this

- Database design influences application code more than I initially expected.
- Separating auth-related data early keeps code cleaner and testing easier.
- In early stages, a schema that’s “good enough” usually enables faster delivery than chasing a “perfect” schema.
- Many issues only surface when you start seeding data and writing the first APIs—and that’s normal in real projects.

---

## 9. Limitations

At the moment, this database design still lacks:

- Audit logging
- Schema versioning/migrations strategy
- Multi-tenancy
- Complex reporting support

---

## 10. What’s next

Now that the foundation is stable enough, the next step is to “bring the data to life”:

- Map this schema to real user flows
- Observe how data moves across services
- Make the auth flow explicit based on the current model

That’s the focus of the next post in the series: **User Flow – what actually happens when users interact with the system**.

---

## 11. Closing thoughts

For me, database design isn’t about predicting every future requirement. It’s about:

- Understanding today’s problem clearly
- Accepting reasonable trade-offs
- Leaving enough room for the system to evolve
