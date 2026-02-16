# VirtuCam

VirtuCam is a professional, system-wide virtual camera engine for Android. Inspired by OBS Studio’s "Virtual Camera" feature, this tool allows you to hook into the Android Camera API and replace physical camera feeds with custom media sources.

By leveraging the **LSPosed (Xposed)** framework and **Root** access, VirtuCam injects media at the system level, ensuring compatibility with a wide range of applications.

---

## 🚀 Key Features

- **System-Wide Injection**: Replace real camera input with images or video files across the entire OS.
- **Media Studio**: A dedicated suite for controlling playback, position, rotation, and scaling.
- **AI Enhancement Suite**: Integrated tools for real-time media adjustments.
- **Low Latency Engine**: Optimized for performance to ensure smooth injection without lag.
- **Modern HUD**: An elegant interface built with React Native for managing hooks and system status.

---

## 🛠 Prerequisites

To use VirtuCam, your device must meet the following requirements:

1.  **Root Access**: Required for system-level process interaction.
2.  **LSPosed Framework**: Must be installed and functional.
3.  **Module Activation**: VirtuCam must be enabled as a module within LSPosed, with target apps selected in the scope.

---

## 📦 Installation & Setup

### For Users

1.  Install the VirtuCam APK on your rooted device.
2.  Open **LSPosed Manager**.
3.  Enable the **VirtuCam** module and select your target applications.
4.  Reboot the target application to apply the hooks.

### For Developers (Local Build)

This project is built using [Expo](https://expo.dev).

1.  **Clone the repository**

    ```bash
    git clone https://github.com/ggsetRanges/virtucam.git
    cd virtucam
    ```

2.  **Install dependencies**

    ```bash
    npm install
    ```

3.  **Start the development server**

    ```bash
    npm start
    ```

4.  **Build the Android project**
    ```bash
    npm run android
    ```

---

## 🧑‍💻 Development

### Available Scripts

- `npm start` - Start the Expo development server
- `npm run android` - Build and run on Android
- `npm run ios` - Build and run on iOS
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier
- `npm run type-check` - Verify TypeScript types
- `npm run validate` - Run all checks (lint, type-check, format)

### Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Code of Conduct

Please read our [Code of Conduct](CODE_OF_CONDUCT.md) before participating.

---

## 📝 Documentation

- [Contributing Guidelines](CONTRIBUTING.md)
- [Security Policy](SECURITY.md)
- [Changelog](CHANGELOG.md)
- [License](LICENSE)

---

## ⚖️ Disclaimer & Legal Information

**For Educational Purposes Only.**

VirtuCam is developed strictly for educational research, debugging, and development testing. It is intended to demonstrate the capabilities of the Android Camera API and the Xposed framework.

- **No Illegal Use**: This software is not intended for, and must not be used for, any illegal activities, including but not limited to bypassing security measures, fraud, or identity theft.
- **User Responsibility**: The user assumes all responsibility for how they utilize this application. The developer shall not be held liable for any misuse, damage to hardware, or legal consequences resulting from the use of this software.
- **No Warranty**: This software is provided "as-is," without warranty of any kind, express or implied.

---

## 🛠 Tech Stack

- **Framework**: [React Native](https://reactnative.dev/) / [Expo](https://expo.dev/)
- **Injection Engine**: [LSPosed](https://github.com/LSPosed/LSPosed) / Xposed API
- **Languages**: Kotlin, Java, TypeScript
- **UI Components**: Lucid-inspired design with Reanimated animations

---

## 🤝 Support

If you encounter issues or wish to contribute:

- **Issues**: Report bugs via the [GitHub Issues](https://github.com/ggsetRanges/virtucam/issues) tab.
- **Pull Requests**: See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.
- **Security**: Report vulnerabilities according to our [Security Policy](SECURITY.md).
- **Discord**: Join the Expo community at [chat.expo.dev](https://chat.expo.dev).

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
