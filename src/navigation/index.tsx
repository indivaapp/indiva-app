import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { useTheme } from '../context/ThemeContext';
import type { Discount, Story } from '../types';

// Screens
import HomeScreen from '../screens/HomeScreen';
import DetailScreen from '../screens/DetailScreen';
import FavoritesScreen from '../screens/FavoritesScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import AktuelScreen from '../screens/AktuelScreen';
import AktuelDetailScreen from '../screens/AktuelDetailScreen';

// Store logos for AktuelDetail header
const STORE_LOGOS: Record<string, any> = {
  bim:  require('../assets/logos/bim.png'),
  a101: require('../assets/logos/a101.png'),
  sok:  require('../assets/logos/sok.png'),
};
import BackButton from '../components/BackButton';
import ProfileScreen from '../screens/ProfileScreen';
import ProfileHelpScreen from '../screens/ProfileHelpScreen';
import ProfilePrivacyScreen from '../screens/ProfilePrivacyScreen';
import ProfileTermsScreen from '../screens/ProfileTermsScreen';
import KazanScreen from '../screens/KazanScreen';
import AffiliateFormScreen from '../screens/AffiliateFormScreen';
import AdvertiseFormScreen from '../screens/AdvertiseFormScreen';
import StoryDetailScreen from '../screens/InfluencerStoryDetailScreen';

export type RootStackParamList = {
  MainTabs: undefined;
  Detail: { id: string; discount?: Discount; discountList?: Discount[]; direction?: 'next' | 'prev' };
  Notifications: undefined;
  AktuelDetail: { storeName: string };
  ProfileHelp: undefined;
  ProfilePrivacy: undefined;
  ProfileTerms: undefined;
  AffiliateForm: undefined;
  AdvertiseForm: undefined;
  StoryDetail: { stories: Story[]; initialIndex: number };
};

export type TabParamList = {
  Home: undefined;
  Aktuel: undefined;
  Kazan: undefined;
  Favorites: undefined;
  Profile: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

interface Props {
  notificationCount: number;
}

function MainTabs({ notificationCount }: { notificationCount: number }) {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: isDark ? Colors.gray800 : Colors.white,
          borderTopColor: isDark ? Colors.gray700 : Colors.gray200,
          height: 64 + insets.bottom,
          paddingBottom: insets.bottom + 8,
        },
        tabBarActiveTintColor: Colors.orange,
        tabBarInactiveTintColor: isDark ? Colors.gray400 : Colors.gray500,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tab.Screen
        name="Home"
        options={{
          tabBarLabel: 'Anasayfa',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, color }}>🏠</Text>,
        }}
      >
        {() => <HomeScreen notificationCount={notificationCount} />}
      </Tab.Screen>

      <Tab.Screen
        name="Aktuel"
        component={AktuelScreen}
        options={{
          tabBarLabel: 'Aktüel',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, color }}>📋</Text>,
        }}
      />

      <Tab.Screen
        name="Kazan"
        component={KazanScreen}
        options={{
          tabBarLabel: '',
          tabBarIcon: () => (
            <View style={[styles.kazanButton, { backgroundColor: isDark ? Colors.gray700 : Colors.white }]}>
              <Text style={{ fontSize: 28, color: Colors.orange, lineHeight: 34 }}>＋</Text>
            </View>
          ),
        }}
      />

      <Tab.Screen
        name="Favorites"
        component={FavoritesScreen}
        options={{
          tabBarLabel: 'Favoriler',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, color }}>♥</Text>,
        }}
      />

      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: 'Profil',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, color }}>👤</Text>,
        }}
      />
    </Tab.Navigator>
  );
}

export default function RootNavigator({ notificationCount }: Props) {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: isDark ? Colors.gray800 : Colors.white },
        headerTintColor: Colors.orange,
        headerTitleStyle: { fontWeight: 'bold' },
        contentStyle: { backgroundColor: isDark ? Colors.gray900 : Colors.gray50 },
      }}
    >
      <Stack.Screen name="MainTabs" options={{ headerShown: false }}>
        {() => <MainTabs notificationCount={notificationCount} />}
      </Stack.Screen>

      <Stack.Screen name="Detail" component={DetailScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="AktuelDetail"
        component={AktuelDetailScreen}
        options={({ navigation, route }) => {
          const slug = (route.params.storeName || '').toLowerCase();
          const logo = STORE_LOGOS[slug];
          return {
            headerTitleAlign: 'center',
            headerLeft: () => <BackButton onPress={() => navigation.goBack()} />,
            title: slug.toUpperCase(),
            headerTitle: () =>
              logo ? (
                <Image
                  source={logo}
                  style={{ width: 90, height: 32 }}
                  resizeMode="contain"
                />
              ) : (
                <Text style={{ fontSize: 16, fontWeight: '800' }}>{slug.toUpperCase()}</Text>
              ),
          };
        }}
      />
      <Stack.Screen
        name="ProfileHelp"
        component={ProfileHelpScreen}
        options={({ navigation }) => ({
          title: 'Yardım & Destek',
          headerLeft: () => <BackButton onPress={() => navigation.goBack()} />,
        })}
      />
      <Stack.Screen
        name="ProfilePrivacy"
        component={ProfilePrivacyScreen}
        options={({ navigation }) => ({
          title: 'Gizlilik Politikası',
          headerLeft: () => <BackButton onPress={() => navigation.goBack()} />,
        })}
      />
      <Stack.Screen
        name="ProfileTerms"
        component={ProfileTermsScreen}
        options={({ navigation }) => ({
          title: 'Kullanım Şartları',
          headerLeft: () => <BackButton onPress={() => navigation.goBack()} />,
        })}
      />
      <Stack.Screen
        name="AffiliateForm"
        component={AffiliateFormScreen}
        options={({ navigation }) => ({
          title: 'İndirim Paylaş',
          headerTitleAlign: 'center',
          headerLeft: () => <BackButton onPress={() => navigation.goBack()} />,
        })}
      />
      <Stack.Screen
        name="AdvertiseForm"
        component={AdvertiseFormScreen}
        options={({ navigation }) => ({
          title: 'İşbirliği Başvurusu',
          headerTitleAlign: 'center',
          headerLeft: () => <BackButton onPress={() => navigation.goBack()} />,
        })}
      />
      <Stack.Screen name="StoryDetail" component={StoryDetailScreen} options={{ headerShown: false, animation: 'fade' }} />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  kazanButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    shadowColor: Colors.orange,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 10,
    borderWidth: 2.5,
    borderColor: Colors.orange,
  },
});
