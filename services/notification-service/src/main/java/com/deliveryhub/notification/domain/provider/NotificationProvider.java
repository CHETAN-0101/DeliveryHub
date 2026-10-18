package com.deliveryhub.notification.domain.provider;

import com.deliveryhub.notification.domain.model.Notification;

public interface NotificationProvider {
    boolean send(Notification notification);
    
    String getChannel();
}