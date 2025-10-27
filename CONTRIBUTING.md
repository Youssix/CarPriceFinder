# Contributing to CarPriceFinder

Thank you for your interest in contributing to CarPriceFinder! This document provides guidelines for contributing to the project.

## 🚀 Quick Start

1. **Fork the repository**
2. **Clone your fork**
   ```bash
   git clone https://github.com/yourusername/carpricefinder.git
   cd carpricefinder
   ```
3. **Install dependencies**
   ```bash
   npm run server:install
   ```
4. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

## 📋 Development Workflow

### Setting Up Environment

1. Copy environment template:
   ```bash
   cp .env.example server/.env
   ```

2. Add your OpenAI API key (optional):
   ```
   OPENAI_API_KEY=your_key_here
   ```

3. Start development server:
   ```bash
   npm run dev
   ```

4. Load extension in Chrome:
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select project root directory

### Making Changes

1. **Code Style**:
   - Use ES6+ JavaScript (async/await preferred)
   - 2 spaces indentation
   - Descriptive variable names
   - Comments in French for business logic, English for technical

2. **Commit Messages**:
   ```
   feat: Add new premium option detection for Porsche
   fix: Resolve cache expiration bug
   docs: Update API documentation
   perf: Optimize LeBonCoin scraping speed
   refactor: Simplify option detection logic
   ```

3. **Testing Your Changes**:
   - Test extension on multiple car listings
   - Verify server endpoints with curl
   - Check browser console for errors
   - Test with and without AI enabled

## 🔧 Adding New Premium Options

Edit `server/aiOptionDetector.js`:

```javascript
const PREMIUM_OPTIONS = {
    'Your New Option': {
        brands: ['BRAND_NAME'],
        valueImpact: 0.12,  // 12% price increase
        keywords: ['keyword1', 'keyword2', 'keyword-3']
    }
};
```

**Test checklist**:
- [ ] Option detected in car title
- [ ] Option detected in equipment list
- [ ] Value impact applied correctly
- [ ] Search terms enhanced properly

## 📝 Pull Request Process

1. **Before submitting**:
   - Ensure code works with and without AI
   - Update CHANGELOG.md with your changes
   - Update README.md if adding features
   - Test on Auto1.com with real listings

2. **PR Description Template**:
   ```markdown
   ## What does this PR do?
   Brief description

   ## Type of change
   - [ ] Bug fix
   - [ ] New feature
   - [ ] Performance improvement
   - [ ] Documentation update

   ## Testing
   - [ ] Tested on Auto1.com
   - [ ] Verified server endpoints
   - [ ] Checked console errors
   - [ ] Tested cache behavior

   ## Screenshots (if UI changes)
   Add screenshots here
   ```

3. **Review Process**:
   - Maintainer will review within 3-5 days
   - Address feedback and update PR
   - Once approved, changes will be merged

## 🐛 Reporting Bugs

**Bug Report Template**:
```markdown
**Describe the bug**
Clear description of the issue

**To Reproduce**
1. Go to Auto1.com
2. Browse to '...'
3. See error

**Expected behavior**
What should happen

**Screenshots**
If applicable

**Environment**:
 - OS: [e.g., macOS 13.4]
 - Browser: [e.g., Chrome 115]
 - Extension version: [e.g., 2.0]
 - Server running: [yes/no]
 - AI enabled: [yes/no]

**Console errors**
Paste browser console output
```

## 💡 Feature Requests

We welcome feature suggestions! Please:
1. Check existing issues first
2. Describe the problem it solves
3. Explain how it benefits users
4. Provide use case examples

## 🔒 Security

**Do NOT commit**:
- API keys or tokens
- `.env` files
- Personal credentials
- User data

**Security issues**: Email security@carpricefinder.com (do not open public issues)

## 📄 License

By contributing, you agree that your contributions will be licensed under the MIT License.

## 🙋 Questions?

- Create a GitHub issue for questions
- Join our discussions
- Check existing documentation in `/docs`

---

**Thank you for contributing to CarPriceFinder!** 🚗💰
