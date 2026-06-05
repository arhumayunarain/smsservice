package com.smsservice.app.di

import android.content.Context
import com.smsservice.app.data.PrefsManager
import com.smsservice.app.sms.SmsSender
import com.smsservice.app.socket.SocketManager
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides
    @Singleton
    fun providePrefsManager(@ApplicationContext context: Context): PrefsManager {
        return PrefsManager(context)
    }

    @Provides
    @Singleton
    fun provideSocketManager(prefsManager: PrefsManager): SocketManager {
        return SocketManager(prefsManager)
    }

    @Provides
    @Singleton
    fun provideSmsSender(): SmsSender {
        return SmsSender()
    }
}
