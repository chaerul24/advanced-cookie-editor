import 'package:flutter/material.dart';
import 'screens/browser_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const CookieBrowserApp());
}

class CookieBrowserApp extends StatelessWidget {
  const CookieBrowserApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Cookie Browser',
      debugShowCheckedModeBanner: false,
      themeMode: ThemeMode.dark,
      darkTheme: ThemeData.dark().copyWith(
        scaffoldBackgroundColor: const Color(0xFF141418),
        colorScheme: const ColorScheme.dark(
          primary: Colors.amber,
          secondary: Colors.blueAccent,
          surface: Color(0xFF1E1E24),
        ),
        appBarTheme: const AppBarTheme(
          backgroundColor: Color(0xFF1E1E24),
          foregroundColor: Colors.white,
          elevation: 0,
        ),
      ),
      home: const BrowserScreen(),
    );
  }
}
