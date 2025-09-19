# 🚀 Deep-Live-Cam Cloud Deployment Guide

## 📁 Separated Architecture

```
Deep-Live-Cam/
├── cloud-server/          # Server for cloud deployment
│   ├── server.py          # Main processing server
│   ├── requirements.txt   # Server dependencies
│   └── deploy.sh         # Auto-deployment script
├── local-client/         # Client applications
│   └── client.html       # Web-based client
└── modules/              # Shared AI processing code
```

## 🖥️ Local Testing (Before Cloud Deployment)

### Quick Test
```bash
# From Deep-Live-Cam directory
python test_separation.py
```

### Manual Test
```bash
# Terminal 1: Start server
cd cloud-server
python server.py --mode cpu

# Terminal 2: Open client
# Open local-client/client.html in browser
# Server URL: ws://localhost:8000
```

## ☁️ AWS Cloud Deployment

### Step 1: Launch EC2 Instance

**Instance Configuration:**
- **Type**: `g5.xlarge` (GPU) or `c5.xlarge` (CPU only)
- **AMI**: Deep Learning AMI (Ubuntu 22.04)
- **Storage**: 50GB gp3 SSD
- **Security Group**:
  - Port 22 (SSH) - Your IP only
  - Port 8000 (Custom TCP) - 0.0.0.0/0

### Step 2: Connect and Deploy

```bash
# SSH into instance
ssh -i your-key.pem ubuntu@ec2-XX-XX-XX-XX.compute-1.amazonaws.com

# Clone repository
git clone https://github.com/your-username/Deep-Live-Cam.git
cd Deep-Live-Cam

# Deploy with GPU acceleration
cd cloud-server
chmod +x deploy.sh
./deploy.sh gpu

# Or deploy with CPU only
./deploy.sh cpu
```

### Step 3: Verify Deployment

```bash
# Check server status
systemctl status deeplivecam

# Monitor logs
./monitor.sh

# Test server endpoint
curl http://localhost:8000/health
```

## 🌐 Client Connection

### Option 1: Web Client (Recommended)

1. **Open** `local-client/client.html` in your browser
2. **Change server URL** to: `ws://YOUR-EC2-IP:8000`
3. **Test connection** using "Test Connection" button
4. **Upload source image** with clear face
5. **Start camera** and allow browser access
6. **Connect to server** and start processing

### Option 2: Direct Browser Access

Navigate to: `http://YOUR-EC2-IP:8000`
*(Uses the original combined interface)*

## 🔧 Server Modes

### CPU Mode
```bash
python server.py --mode cpu
```
- **Performance**: 2-5 FPS
- **Memory**: 2-4 GB RAM
- **Use case**: Testing, light usage

### GPU Mode
```bash
python server.py --mode gpu
```
- **Performance**: 15-30 FPS
- **Memory**: 4-8 GB VRAM + 2-4 GB RAM
- **Use case**: Production, multiple clients

## 📊 Performance Expectations

| Mode | Instance Type | Performance | Concurrent Users |
|------|---------------|-------------|------------------|
| CPU  | c5.xlarge     | 2-5 FPS     | 1-2             |
| CPU  | c5.2xlarge    | 3-7 FPS     | 2-3             |
| GPU  | g5.xlarge     | 15-30 FPS   | 5-10            |
| GPU  | g5.2xlarge    | 20-40 FPS   | 10-15           |

## 🔍 Troubleshooting

### Server Issues

**"Connection refused"**
```bash
# Check if server is running
systemctl status deeplivecam

# Check port availability
netstat -tulpn | grep :8000

# Restart server
sudo systemctl restart deeplivecam
```

**"GPU not detected"**
```bash
# Check NVIDIA driver
nvidia-smi

# Reinstall if needed
sudo ubuntu-drivers autoinstall
sudo reboot
```

### Client Issues

**"WebSocket connection failed"**
- Verify server URL format: `ws://IP:8000` (not `http://`)
- Check security group allows port 8000
- Ensure server is running: `curl http://IP:8000/health`

**"Camera access denied"**
- Use HTTPS for secure contexts
- Try different browser (Chrome/Firefox)
- Check browser permissions

### Performance Issues

**Slow processing**
- Verify GPU mode: Check `/status` endpoint
- Monitor GPU usage: `nvidia-smi`
- Reduce image quality in client

## 🔒 Security Considerations

### Production Deployment

1. **Add authentication**:
   ```python
   # Add API key validation
   @app.middleware("http")
   async def validate_api_key(request, call_next):
       # Implement API key check
   ```

2. **Enable HTTPS**:
   ```bash
   # Install SSL certificate
   sudo certbot --nginx -d yourdomain.com
   ```

3. **Restrict access**:
   ```bash
   # Update security group
   # Port 8000: Your client IPs only
   ```

4. **Monitor usage**:
   ```bash
   # Set up CloudWatch monitoring
   # Track connections, CPU, GPU usage
   ```

## 🚀 Scaling Options

### Load Balancing
```bash
# Multiple server instances behind ALB
# Sticky sessions for WebSocket connections
```

### Auto Scaling
```bash
# EC2 Auto Scaling based on CPU/GPU metrics
# Scale up: High GPU utilization
# Scale down: Low connection count
```

### Container Deployment
```bash
# Docker containerization
# ECS/EKS deployment
# Kubernetes orchestration
```

## 📈 Monitoring

### Server Metrics
- GPU utilization (`nvidia-smi`)
- Memory usage (`htop`)
- Network traffic (`iftop`)
- Connection count (server logs)

### Client Metrics
- FPS (frames per second)
- Latency (processing time)
- Connection stability
- Error rates

## 💡 Optimization Tips

1. **Reduce latency**: Use same AWS region
2. **Improve FPS**: Upgrade to g5.2xlarge or higher
3. **Handle load**: Implement client queuing
4. **Save costs**: Auto-stop during low usage
5. **Monitor health**: Set up alerts for server issues

---

## 🎯 Quick Deployment Checklist

- [ ] Launch g5.xlarge EC2 instance
- [ ] Configure security group (ports 22, 8000)
- [ ] SSH and clone repository
- [ ] Run `./deploy.sh gpu`
- [ ] Verify server: `curl http://IP:8000/health`
- [ ] Test client connection
- [ ] Upload source image and test processing

**🎉 Ready for production!**