# Budget Tool

A self-hosted, open-source envelope budgeting application using plain text accounting principles.

## 🎯 Overview

Budget Tool is a privacy-focused personal finance application that combines the envelope budgeting method with plain text accounting (compatible with ledger/hledger). It provides a modern web interface while maintaining your financial data in a human-readable, version-controllable format.

## ✨ Features

- 📦 **Envelope Budgeting**: Organize your money into virtual envelopes for different spending categories
- 📄 **Plain Text Accounting**: All data stored in ledger/hledger compatible format
- 📅 **Month-by-Month View**: Intuitive monthly budget management
- 💳 **CSV Import**: Import transactions from your bank
- 🔄 **Transaction Allocation**: Easily categorize imported transactions
- 💸 **Fund Transfers**: Move money between envelopes as needed
- 🔒 **Privacy-First**: Self-hosted solution with no external data sharing
- 🐳 **Docker-Based**: Simple deployment using Docker Compose

## 🚀 Quick Start

### Prerequisites

- Docker and Docker Compose installed
- 2GB RAM minimum
- 1GB free disk space

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/budget-tool.git
   cd budget-tool
   ```

2. Copy the environment file:
   ```bash
   cp .env.example .env
   ```

3. Start the application:
   ```bash
   docker-compose up -d
   ```

4. Access the application at `http://localhost:3000`

## 🛠️ Development

### Tech Stack

- **Backend**: Python 3.14, FastAPI
- **Frontend**: SvelteKit, TypeScript, Tailwind CSS
- **Storage**: Plain text ledger files
- **Deployment**: Docker, Docker Compose

### Development Setup

1. Install dependencies:
   ```bash
   # Backend
   cd api
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt

   # Frontend
   cd ../frontend
   npm install
   ```

2. Run in development mode:
   ```bash
   docker-compose -f docker-compose.dev.yml up
   ```

### Running Tests

```bash
# Backend tests
cd api
pytest

# Frontend tests
cd frontend
npm run test
npm run test:e2e
```

## 📚 Documentation

- [User Guide](docs/user-guide.md)
- [API Documentation](docs/api.md)
- [Development Guide](docs/development.md)
- [Deployment Guide](docs/deployment.md)

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Inspired by [Actual Budget](https://actualbudget.com/)
- Built on [ledger](https://www.ledger-cli.org/) and [hledger](https://hledger.org/) principles
- Uses the envelope budgeting method

## 🔗 Links

- [Project Homepage](https://github.com/yourusername/budget-tool)
- [Issue Tracker](https://github.com/yourusername/budget-tool/issues)
- [Discussions](https://github.com/yourusername/budget-tool/discussions)

## 📊 Status

🚧 **MVP Development** - This project is currently in active development. Core features are being implemented.