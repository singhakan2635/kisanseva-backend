# KisanSeva Backend - Engineering Standards

## You Are
A senior architect creating a production-ready, high-visibility project with **zero chance of error**. Every change must be thoroughly tested, reviewed, and validated before deployment.

## Project Overview

KisanSeva is an agriculture/farmer services platform that helps farmers identify plant diseases, deficiencies, and get treatment recommendations (mechanical, physical, and chemical) with probability scores.

### Infrastructure

| Component | Resource | URL |
|-----------|----------|-----|
| Backend repo | singhakan2635/kisanseva-backend | github.com |
| Frontend repo | singhakan2635/kisanseva-frontend | github.com |
| Backend Heroku | kisanseva-backend | https://kisanseva-backend-d6034e449591.herokuapp.com/ |
| Frontend Heroku | kisanseva-frontend | https://kisanseva-frontend-e6be1e269532.herokuapp.com/ |
| Database | kisanseva-db (separate DB, same Atlas cluster as Medigent) | MongoDB Atlas |

### Vision & Features (Target: Similar to Plantix/Agrio)
- **Plant Disease Detection**: Upload photo via app or WhatsApp, get accurate disease/deficiency diagnosis with probability scores
- **Treatment Recommendations**: Mechanical, physical, and chemical solutions for each detected issue
- **Sample Disease Images**: Show similar disease photos for farmer to confirm diagnosis
- **Farmer Profiles**: Custom profiles with plant/crop details
- **Comprehensive Database**: All pesticides, diseases, and deficiencies stored in backend for AI reference
- **Government Integration**: Integrate with https://vistaar.da.gov.in/ API for government schemes and data
- **Multi-language Support**: Using Sarvam AI (https://www.sarvam.ai/api-pricing) for Indian language support - critical for farmer accessibility
- **WhatsApp Bot**: Primary channel for farmers to interact (photo upload, get diagnosis, treatment advice)
- **Web/Mobile App**: Full-featured app with registration, WhatsApp number, farmer photo upload
- **Data Pipeline**: Scrape disease/pesticide data from existing apps and agricultural databases, then train models on that data

### Tech Stack
- **Backend**: Express 5 + TypeScript + MongoDB Atlas (kisanseva-db)
- **Auth**: Firebase + JWT, roles: farmer/expert/admin/team_member
- **AI**: Sarvam AI for Indian languages, custom trained model for disease detection
- **WhatsApp**: Cloud API integration (same pattern as Medigent)
- **Logging**: Winston only - NEVER use console.log

## Cost Control Rules (CRITICAL)

### AI API Spending
- **Claude Haiku ONLY** for all Anthropic API calls (diagnosis, summaries). NEVER use Sonnet or Opus in production — too expensive.
- **Sarvam AI** for ALL translations (UI strings + disease data + descriptions). Single translation engine, no duplication.
- **Generate once, cache forever**: All translations, farmer summaries, and TTS audio must be cached in the database. Never translate the same content twice.
- **Rate limit awareness**: Sarvam has rate limits. Batch scripts must include delays (1-2s between calls) and retry logic.
- **Budget tracking**: Log every external API call with cost estimate. Add a `GET /api/admin/api-costs` endpoint that shows daily/monthly API spend.

### Cost-Effective Architecture
- **CNN model first** (free, runs locally on dyno): DINOv2 handles ~70% of scans with zero API cost.
- **Claude Haiku fallback** (cheap): Only called when CNN confidence is low or crop doesn't match. ~$0.001 per call.
- **Sarvam translations** (one-time): Translate all 781 diseases × 22 languages ONCE (~$17). Then serve from DB cache forever.
- **TTS audio caching**: Generate audio for each disease summary + language combo ONCE. Store URL, serve cached.
- **NEVER call an API in a loop without checking cache first.**
- **Pre-generate in batch scripts** (off-peak) rather than on-the-fly during user requests.

### Spending Limits
- Monthly Anthropic API budget: monitor via dashboard, alert if > $50/month
- Monthly Sarvam API budget: mostly one-time, ongoing should be < $10/month
- If costs spike, check logs for missing cache hits or translation loops

## Engineering Rules

### CI/CD First
- Set up CI/CD pipeline BEFORE starting feature development
- Every PR must pass automated tests before merge
- Use GitHub Actions for CI (lint, type-check, test)

### Testing is Mandatory
- Always add tests for anything we deploy
- Unit tests for services and utilities
- Integration tests for API endpoints
- E2E tests for critical user flows
- No PR merges without passing tests

### Deployment Protocol
- Always deploy to staging first, get approval before production
- Never change business logic without explicit permission
- Use feature branches, never push directly to main

### Code Quality
- TypeScript strict mode - no `any` types
- Winston logger only - never console.log
- All env vars through src/config/env.ts
- Controller-Service-Model pattern
- Validate all inputs with express-validator
- Rate limiting on all auth endpoints

### Database
- kisanseva-db is completely separate from Medigent's health-app database
- Same Atlas cluster for cost efficiency, but zero data sharing
- Always add proper indexes for query performance
