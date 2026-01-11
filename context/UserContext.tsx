import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { usePrivy } from '@privy-io/expo';

interface UserProfile {
    firstName: string;
    lastName: string;
}

interface ProfileIcon {
    emoji?: string;
    colorIndex?: number;
    imageUri?: string;
}

interface WalletAddresses {
    evm?: string;
    solana?: string;
}

interface UserContextType {
    userName: UserProfile;
    profileIcon: ProfileIcon;
    walletAddresses: WalletAddresses;
    isLoadingProfile: boolean;
    refreshProfile: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, getAccessToken } = usePrivy();
    const [userName, setUserName] = useState<UserProfile>({ firstName: '', lastName: '' });
    const [profileIcon, setProfileIcon] = useState<ProfileIcon>({});
    const [walletAddresses, setWalletAddresses] = useState<WalletAddresses>({});
    const [isLoadingProfile, setIsLoadingProfile] = useState(false);

    const fetchUserProfile = useCallback(async (retryCount = 0) => {
        if (!user || !user.id) {
            return;
        }

        try {
            const token = await getAccessToken();
            if (!token) {
                return;
            }

            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

            // Only show loader on initial load if we don't have data
            if (!userName.firstName) {
                setIsLoadingProfile(true);
            }

            const profileResponse = await fetch(`${apiUrl}/api/users/profile`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });

            if (!profileResponse.ok) {
                if (retryCount < 3) {
                    setTimeout(() => fetchUserProfile(retryCount + 1), 1000);
                }
                return;
            }

            const profileData = await profileResponse.json();

            if (profileData.success && profileData.data) {
                const userData = profileData.data.user || profileData.data;

                setUserName({
                    firstName: userData.firstName || '',
                    lastName: userData.lastName || ''
                });

                if (userData.avatar) {
                    try {
                        if (typeof userData.avatar === 'string' && userData.avatar.trim().startsWith('{')) {
                            const parsed = JSON.parse(userData.avatar);
                            setProfileIcon(parsed);
                        } else {
                            setProfileIcon({ imageUri: userData.avatar });
                        }
                    } catch (e) {
                        setProfileIcon({ imageUri: userData.avatar });
                    }
                } else if (userData.profileEmoji) {
                    setProfileIcon({ emoji: userData.profileEmoji });
                } else if (userData.profileColorIndex !== undefined) {
                    setProfileIcon({ colorIndex: userData.profileColorIndex });
                }

                const evmAddr = userData.ethereumWalletAddress || userData.baseWalletAddress || userData.celoWalletAddress;
                const solAddr = userData.solanaWalletAddress;

                setWalletAddresses({
                    evm: evmAddr,
                    solana: solAddr
                });

                if (!evmAddr && !solAddr && retryCount < 3) {
                    setTimeout(() => fetchUserProfile(retryCount + 1), 2000);
                }
            }
        } catch (error) {
            console.error('Error fetching user profile:', error);
        } finally {
            setIsLoadingProfile(false);
        }
    }, [user, getAccessToken, userName.firstName]);

    // Fetch profile on mount or when user changes
    useEffect(() => {
        if (user) {
            fetchUserProfile();
        } else {
            // Reset state on logout
            setUserName({ firstName: '', lastName: '' });
            setProfileIcon({});
            setWalletAddresses({});
        }
    }, [user, fetchUserProfile]);

    return (
        <UserContext.Provider value={{
            userName,
            profileIcon,
            walletAddresses,
            isLoadingProfile,
            refreshProfile: () => fetchUserProfile(0)
        }}>
            {children}
        </UserContext.Provider>
    );
};

export const useUser = () => {
    const context = useContext(UserContext);
    if (context === undefined) {
        throw new Error('useUser must be used within a UserProvider');
    }
    return context;
};
