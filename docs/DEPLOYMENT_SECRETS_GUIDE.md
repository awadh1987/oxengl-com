# GitHub Actions Deployment Secrets Guide

This guide configures the repository secrets used by [.github/workflows/deploy.yml](.github/workflows/deploy.yml). The workflow connects to the cloud server over SSH, updates the repository, rebuilds Docker images, and starts the ERP stack.

## Add Repository Secrets

1. Open the ERP repository on GitHub.
2. Select **Settings**.
3. In the sidebar, select **Secrets and variables**, then **Actions**.
4. Select **New repository secret**.
5. Enter the exact secret name and value below, then select **Add secret**.
6. Repeat until all five secrets exist.

GitHub hides a secret after it is saved. Do not commit these values, put them in issue comments, or print them in workflow output.

| Secret name | Required value | Formatting rules |
| --- | --- | --- |
| `SSH_HOST` | Public static IPv4 address or DNS name of the cloud server. | Use only the host, for example `203.0.113.10` or `erp.example.com`. Do not include `ssh://`, a username, path, or port. |
| `SSH_USERNAME` | Administrative SSH account on the target host. | Examples: `ubuntu`, `ec2-user`, `root`, or a dedicated `deploy` user. Prefer a non-root deploy user where supported. |
| `SSH_PORT` | SSH daemon port. | Enter digits only. Use `22` unless `sshd` uses a different port. |
| `DEPLOY_PATH` | Absolute server directory containing the cloned repository and `docker-compose.yml`. | Use a Linux path such as `/home/ubuntu/meayon-erp`. Do not use quotes, a trailing slash command, or a Windows path. |
| `SSH_PRIVATE_KEY` | Private key whose public key is in the remote user's `~/.ssh/authorized_keys`. | Paste the complete raw, unencrypted OpenSSH key with its boundary lines and all line breaks. Do not add quotes or escape characters. |

## Private Key Format

`SSH_PRIVATE_KEY` must contain all lines of the key:

```text
-----BEGIN OPENSSH PRIVATE KEY-----
... key content ...
-----END OPENSSH PRIVATE KEY-----
```

Create a dedicated deployment key on a trusted administrative workstation:

```bash
ssh-keygen -t ed25519 -C "github-actions-meayon-erp-deploy" -f ~/.ssh/meayon_erp_deploy
```

Install the resulting public key on the target server. The private file, `~/.ssh/meayon_erp_deploy`, is the value for `SSH_PRIVATE_KEY`; the `.pub` file belongs in the target account's `authorized_keys` file.

```bash
ssh-copy-id -i ~/.ssh/meayon_erp_deploy.pub -p 22 ubuntu@203.0.113.10
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

Use a separate key for CI/CD and rotate it immediately if it is exposed or no longer needed.

## Remote Server Pre-Flight

Connect to the target cloud server before the first deployment:

```bash
ssh -i ~/.ssh/meayon_erp_deploy -p 22 ubuntu@203.0.113.10
```

On an Ubuntu server, run these commands once. Replace the repository URL and destination path with the deployment values.

```bash
sudo apt-get update
sudo apt-get install -y git docker.io docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
mkdir -p /home/ubuntu/meayon-erp
git clone <repository-url> /home/ubuntu/meayon-erp
mkdir -p /home/ubuntu/meayon-erp/backend_data
mkdir -p /home/ubuntu/meayon-erp/logs/nginx
```

Log out and reconnect after adding the user to the `docker` group. Then verify the required tools and Compose configuration:

```bash
exit
ssh -i ~/.ssh/meayon_erp_deploy -p 22 ubuntu@203.0.113.10
cd /home/ubuntu/meayon-erp
git status
git --version
docker --version
docker compose version
docker compose config
docker compose up --build -d
docker compose ps
```

For distributions providing only the standalone `docker-compose` command, install the supported standalone package and keep the server command consistent with the workflow's `docker-compose` commands.

## Private Repository Access

The remote clone must be able to run `git pull origin main` without interaction. Before the first automatic deployment, configure either a read-only GitHub deploy key or a fine-grained, read-only GitHub token on the server.

Do not reuse `SSH_PRIVATE_KEY` for server-to-GitHub repository access unless the same key is intentionally configured as a GitHub deploy key. Using separate CI-to-server and server-to-GitHub keys limits the impact of a rotation.

## First Deployment Check

Push a commit to `main` or `production`, then open the repository **Actions** tab and select **Deploy ERP**. On the server, verify both containers and recent logs:

```bash
cd /home/ubuntu/meayon-erp
docker compose ps
docker compose logs --tail=100 web-backend
docker compose logs --tail=100 proxy-gateway
```

The current workflow always runs `git pull origin main`, even for a `production` push. Keep `main` deployable, or update [.github/workflows/deploy.yml](.github/workflows/deploy.yml) to pull the triggering branch.