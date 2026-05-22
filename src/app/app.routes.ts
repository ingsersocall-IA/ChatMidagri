import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { guestGuard } from './core/guest.guard';
import { LoginComponent } from './auth/login.component';
import { RegisterComponent } from './auth/register.component';
import { ChatComponent } from './chat/chat.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent, canActivate: [guestGuard] },
  { path: 'register', component: RegisterComponent, canActivate: [guestGuard] },
  {
    path: 'chat/:conversationId',
    component: ChatComponent,
    canActivate: [authGuard],
  },
  { path: 'chat', component: ChatComponent, canActivate: [authGuard] },
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'chat',
  },
  { path: '**', redirectTo: 'chat' },
];
