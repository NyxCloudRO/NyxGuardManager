# NyxGuard New Features

Status: proposal only. Service Discovery is not implemented in the 5.0.0 release.

## Service Discovery

### Purpose

Service Discovery should find reachable web applications on administrator-approved LAN networks and make it faster to create protected NyxGuard Proxy Hosts.

Its primary value is discovering services and safely turning them into normal, fully editable NyxGuard Proxy Hosts with minimal manual data entry.

### Core requirements

- The feature must be completely agentless.
- Users must not need to install software on remote VMs or Linux hosts.
- NyxGuard Manager performs discovery from its own host/container.
- Scanning is opt-in and limited to IP ranges, ports, and schedules explicitly approved by an administrator.
- Discovery must never modify a remote machine.
- Discovery must not require SSH credentials or remote administrative access.
- Discovered services are suggestions only; nothing is published automatically.

### Services it should discover

The scanner should detect reachable HTTP and HTTPS services regardless of how they are installed, including:

- Applications installed directly on Linux
- systemd-managed web services
- Docker or containerized applications
- Appliances and other LAN web interfaces
- Custom applications listening on reachable TCP ports

The scanner can only detect services reachable from the NyxGuard Manager host. Applications bound exclusively to `127.0.0.1`, Unix sockets, or otherwise blocked from the LAN remain intentionally outside discovery and can be configured manually.

### Administrator controls

Administrators choose:

- Which CIDR ranges or individual IP addresses may be scanned
- Which ports may be checked, such as `80`, `443`, `3000`, `8080`, and `8443`
- Whether scans run manually or on a schedule
- Timeouts and concurrency limits
- Which addresses or services should be ignored

NyxGuard must not automatically scan the entire LAN.

### Discovery results

Each result should show, when available:

- IP address and port
- HTTP or HTTPS protocol
- Page title
- Probable application or service type
- TLS certificate status
- Basic reachability and health information
- Whether the service is already protected by NyxGuard
- Whether an existing Proxy Host points to a service that is no longer reachable

### Proxy Host workflow

Each discovered service should provide a **Create Proxy Host** action. NyxGuard may prefill:

- Application name
- Forward hostname or IP address
- Forward port and scheme
- Suggested domain, when enough information is available
- WebSocket requirements
- SSL certificate options
- Recommended WAF or protection preset
- Health-check configuration
- Exposure or authentication warnings

The administrator reviews and approves everything before creation.

After approval, the result becomes a standard NyxGuard Proxy Host. It remains fully editable through the existing **NyxGuard Proxy Hosts** page.

### Existing manual workflow

NyxGuard Proxy Hosts must remain the primary manual management feature.

- Users can continue to manually create, edit, and delete Proxy Hosts.
- Manual hosts do not require discovery, Docker labels, or additional software.
- Every host created through discovery can be changed manually afterward.
- Service Discovery can be disabled entirely.
- Discovery complements Proxy Hosts; it does not replace or restrict them.

### Suggested interface placement

Add **Service Discovery** as a separate sidebar page near **Applications** or **NyxGuard Proxy Hosts**.

The page should include:

- Scan targets and port configuration
- Start Scan action
- Current scan progress
- Discovered and ignored services
- Already-protected status
- Create Proxy Host actions
- Scan history and configuration-drift warnings

### Explicitly rejected design

Do not require a NyxGuard agent on every VM. Installing and maintaining agents across many VMs would add more work than manually creating Proxy Hosts and would undermine the purpose of discovery.
