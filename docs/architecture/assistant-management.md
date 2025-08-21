# AutoLynx Architecture — Deployment & Operations

> **Infrastructure, Configuration & Operational Concerns**  
> **Related:** [System Overview](./system-overview.md) | [Security & Auth](./security-auth.md) | [Reference Materials](./reference-materials.md)

---

## Infrastructure Architecture

### Platform Overview

```mermaid
graph TB
    subgraph "Vercel Platform"
        A[Next.js App Router]
        B[API Routes]
        C[Vercel Cron]
    end
    
    subgraph "Supabase Platform"
        D[Postgres Database]
        E[Supabase Auth]
        F[Real-time Subscriptions]
    end
    
    subgraph "External Services"
        G[Vapi Voice AI]
        H[Webhook Endpoints]
    end
    
    A --> D
    A --> E
    A --> F
    B --> D
    B --> G
    C --> B
    G --> H
    H --> B
```

#### Technology Stack
- **Frontend**: Next.js 14+ with App Router
- **Backend**: Next.js API routes (serverless functions)
- **Database**: Supabase (Postgres) with real-time subscriptions
- **Authentication**: Supabase Auth with JWT tokens
- **Voice AI**: Vapi for outbound calling
- **Hosting**: Vercel (frontend + API + cron)
- **Monitoring**: Vercel Analytics + custom logging

### Deployment Environments

#### Development Environment
```yaml
Environment: dev
Domain: autolynx-dev.vercel.app
Database: Supabase dev project
Vapi: Sandbox account
Features:
  - Hot reload development
  - Debug logging enabled
  - Test data seeding
  - Mock external services
```

#### Production Environment  
```yaml
Environment: prod
Domain: autolynx.com
Database: Supabase production project
Vapi: Production account with real phone numbers
Features:
  - Optimized builds
  - Error tracking
  - Performance monitoring
  - Automated backups
```

---

## Configuration Management

### Environment Variables

#### Required Variables
```bash
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ... # Server-side operations
SUPABASE_ANON_KEY=eyJ...         # Client-side auth

# Database Direct Connection (optional)
DATABASE_URL=postgresql://postgres:password@db.your-project.supabase.co:5432/postgres

# Vapi Integration
VAPI_API_KEY=your-vapi-api-key
VAPI_PHONE_NUMBER_ID=your-phone-number-id

# Security Secrets
WEBHOOK_SHARED_SECRET=random-secure-string-256-bits
CRON_SHARED_SECRET=random-secure-string-256-bits

# Optional Configuration
DEFAULT_CONCURRENCY_CAP=8
DEFAULT_CRON_CADENCE=60
LOG_LEVEL=info
```

#### Secret Management
- **Vercel Environment Variables**: Secure storage for all secrets
- **Environment-Specific**: Different secrets for dev/prod environments
- **No Client Exposure**: Service role keys never sent to client
- **Rotation Policy**: Regular rotation of all secrets

### Application Configuration

#### Feature Flags
```typescript
const config = {
  features: {
    strictBatching: true,
    phoneLineHealthCheck: true,
    transcriptAnalysis: true,
    costTracking: true,
    exportFunctionality: true,
  },
  limits: {
    maxConcurrentCalls: parseInt(process.env.DEFAULT_CONCURRENCY_CAP) || 8,
    maxCampaignSize: 10000,
    maxFileUploadSize: 10 * 1024 * 1024, // 10MB
    cronCadenceSeconds: parseInt(process.env.DEFAULT_CRON_CADENCE) || 60,
  },
  integrations: {
    vapi: {
      apiKey: process.env.VAPI_API_KEY,
      phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
      baseUrl: 'https://api.vapi.ai',
    },
    supabase: {
      url: process.env.SUPABASE_URL,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      anonKey: process.env.SUPABASE_ANON_KEY,
    },
  },
};
```

---

## Deployment Pipeline

### CI/CD Workflow

```mermaid
graph TD
    A[Git Push] --> B[GitHub Actions]
    B --> C[Install Dependencies]
    C --> D[Run Tests]
    D --> E[Build Application]
    E --> F[Deploy to Vercel]
    F --> G[Run Integration Tests]
    G --> H[Health Check]
    H --> I[Success]
    
    D -->|Test Failure| J[Fail Deployment]
    F -->|Deploy Failure| J
    G -->|Integration Failure| K[Rollback]
```

#### GitHub Actions Configuration
```yaml
name: Deploy to Vercel
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      - run: npm ci
      - run: npm run test
      - run: npm run test:integration

  deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: vercel/action@v1
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
```

#### Deployment Stages
1. **Code Commit**: Push to main branch triggers deployment
2. **Automated Testing**: Unit tests, integration tests, linting
3. **Build Process**: Next.js build with optimization
4. **Deploy to Vercel**: Atomic deployment with preview URLs
5. **Health Checks**: Verify deployment success and API functionality
6. **Rollback on Failure**: Automatic rollback if health checks fail

### Database Migrations

#### Migration Strategy
```sql
-- Migration file: 001_initial_schema.sql
BEGIN;

-- Create extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create types
CREATE TYPE call_status AS ENUM (...);

-- Create tables
CREATE TABLE assistants (...);
CREATE TABLE campaigns (...);

-- Create indexes
CREATE INDEX idx_calls_active ON calls(campaign_id) 
WHERE status IN ('QUEUED', 'RINGING', 'IN_PROGRESS');

COMMIT;
```

#### Migration Execution
1. **Pre-deployment**: Run migrations before code deployment
2. **Backup First**: Automatic backup before schema changes
3. **Rollback Plan**: Every migration has rollback instructions
4. **Zero Downtime**: Use additive changes when possible

---

## Monitoring & Observability

### Application Monitoring

#### Metrics Collection
```typescript
// Custom metrics tracking
const metrics = {
  async trackCampaignMetrics(campaignId: string) {
    const metrics = await db.query(`
      SELECT 
        status,
        COUNT(*) as count,
        AVG(cost_usd) as avg_cost,
        AVG(EXTRACT(EPOCH FROM (ended_at - started_at))) as avg_duration
      FROM calls 
      WHERE campaign_id = $1 
      GROUP BY status
    `, [campaignId]);
    
    // Send to monitoring service
    await analytics.track('campaign_metrics', {
      campaignId,
      metrics: metrics.rows
    });
  }
};
```

#### Key Metrics
- **Campaign Performance**: Success rates, completion times, cost per call
- **System Performance**: API response times, database query performance
- **Error Rates**: Failed calls, webhook failures, authentication errors
- **Resource Usage**: Database connections, memory usage, function execution time

### Error Tracking

#### Structured Logging
```typescript
const logger = {
  error(message: string, context: any = {}) {
    console.error(JSON.stringify({
      level: 'error',
      message,
      timestamp: new Date().toISOString(),
      context,
      trace: new Error().stack
    }));
  },
  
  warn(message: string, context: any = {}) {
    console.warn(JSON.stringify({
      level: 'warn', 
      message,
      timestamp: new Date().toISOString(),
      context
    }));
  }
};
```

#### Error Categories
- **User Errors**: Invalid input, authorization failures
- **System Errors**: Database timeouts, external API failures
- **Integration Errors**: Vapi API errors, webhook processing failures
- **Performance Errors**: Slow queries, memory exhaustion

### Health Checks

#### Application Health
```typescript
// /api/health endpoint
export async function GET() {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    checks: {
      database: await checkDatabase(),
      vapi: await checkVapiConnection(),
      auth: await checkSupabaseAuth(),
    }
  };
  
  const isHealthy = Object.values(health.checks).every(check => check.healthy);
  
  return Response.json(health, {
    status: isHealthy ? 200 : 503
  });
}
```

#### External Dependencies
- **Database**: Connection test and query performance
- **Vapi API**: API reachability and response time
- **Supabase Auth**: Token validation service
- **Webhook Endpoints**: Webhook delivery success rate

---

## Performance Optimization

### Database Performance

#### Query Optimization
```sql
-- Optimized query for active call count
EXPLAIN ANALYZE
SELECT COUNT(*) 
FROM calls 
WHERE campaign_id = $1 
  AND status IN ('QUEUED', 'RINGING', 'IN_PROGRESS');

-- Use partial index for performance
CREATE INDEX idx_calls_active ON calls(campaign_id) 
WHERE status IN ('QUEUED', 'RINGING', 'IN_PROGRESS');
```

#### Connection Management
- **Connection Pooling**: Supabase handles connection pooling automatically
- **Query Optimization**: Use indexes and efficient query patterns
- **Read Replicas**: Use read replicas for analytics queries (future)
- **Caching**: Cache frequently accessed data in memory

### API Performance

#### Response Time Optimization
```typescript
// API route optimization
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const campaignId = searchParams.get('campaignId');
  
  // Cache frequently accessed data
  const cacheKey = `campaign:${campaignId}:summary`;
  const cached = await cache.get(cacheKey);
  
  if (cached) {
    return Response.json(cached);
  }
  
  const data = await fetchCampaignSummary(campaignId);
  await cache.set(cacheKey, data, { ttl: 60 }); // 1 minute cache
  
  return Response.json(data);
}
```

#### Caching Strategy
- **Response Caching**: Cache expensive aggregations for 1-5 minutes
- **Static Assets**: CDN caching for static resources
- **Database Query Caching**: Cache commonly used lookup data
- **Real-time Balance**: Use real-time subscriptions for critical updates

### Frontend Performance

#### Code Splitting
```typescript
// Dynamic imports for large components
const CampaignDetail = dynamic(() => import('../components/CampaignDetail'), {
  loading: () => <Skeleton />,
  ssr: false
});
```

#### Performance Optimizations
- **Code Splitting**: Load components on demand
- **Image Optimization**: Next.js automatic image optimization
- **Bundle Analysis**: Regular bundle size monitoring
- **Performance Budgets**: Set limits on bundle sizes

---

## Scaling Considerations

### Current Limitations

#### Identified Bottlenecks
- **Concurrent Calls**: Limited by Vapi plan (10 concurrent on free)
- **Database Connections**: Supabase connection limits based on plan
- **Function Duration**: Vercel 10s timeout for API routes
- **File Upload**: 10MB limit for CSV uploads

#### Monitoring Thresholds
```typescript
const scalingThresholds = {
  concurrentCalls: {
    warning: 6,    // 75% of 8 cap
    critical: 8,   // 100% of cap
  },
  databaseConnections: {
    warning: 80,   // 80% of plan limit
    critical: 95,  // 95% of plan limit
  },
  responseTime: {
    warning: 2000, // 2 second response time
    critical: 5000, // 5 second response time
  }
};
```

### Scaling Strategies

#### Horizontal Scaling
- **Serverless Functions**: Vercel functions auto-scale based on demand
- **Database Scaling**: Upgrade Supabase plan for more connections
- **CDN**: Use Vercel CDN for static asset distribution
- **Microservices**: Extract heavy processing to dedicated services

#### Vertical Scaling
- **Database Resources**: Increase CPU/memory for database
- **Function Resources**: Optimize function memory allocation
- **Caching**: Implement Redis for distributed caching
- **Queue Processing**: Use background job queues for heavy tasks

### Future Architecture

#### Multi-Tenant Scaling
```sql
-- Partition tables by organization
CREATE TABLE campaigns_org_1 (
  LIKE campaigns INCLUDING ALL,
  CHECK (org_id = 1)
) INHERITS (campaigns);

CREATE TABLE campaigns_org_2 (
  LIKE campaigns INCLUDING ALL, 
  CHECK (org_id = 2)
) INHERITS (campaigns);
```

#### Microservices Migration
- **Call Processing Service**: Dedicated service for call management
- **Analytics Service**: Separate service for reporting and analytics
- **Notification Service**: Handle webhooks and notifications
- **File Processing Service**: Handle large CSV processing

---

## Disaster Recovery

### Backup Strategy

#### Automated Backups
- **Database**: Supabase automated daily backups with point-in-time recovery
- **Code**: Git repository with multiple remotes
- **Configuration**: Environment variables backed up securely
- **Documentation**: Architecture and operational procedures documented

#### Backup Testing
```typescript
// Automated backup verification
async function verifyBackup() {
  const backupTest = await supabase 