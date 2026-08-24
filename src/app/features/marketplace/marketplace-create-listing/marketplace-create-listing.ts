import { Component, OnInit, OnDestroy } from '@angular/core';
import { NgIf, NgFor, AsyncPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Store } from '@ngrx/store';
import { Actions, ofType } from '@ngrx/effects';
import { Observable, Subject, takeUntil } from 'rxjs';
import { LucideAngularModule, ArrowLeft, Send } from 'lucide-angular';
import { CreateListingRequest } from '../../../core/services/marketplace.service';
import { ProjectsService } from '../../../core/services/projects.service';
import { NotificationService } from '../../../core/services/notification.service';
import { Project } from '../../../core/models/project.model';
import { AppState } from '../../../core/store/app.state';
import * as MarketplaceActions from '../../../core/store/marketplace/marketplace.actions';
import { selectMarketplaceCreating } from '../../../core/store/marketplace/marketplace.selectors';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner';

@Component({
  selector: 'app-marketplace-create-listing',
  standalone: true,
  imports: [
    NgIf,
    NgFor,
    AsyncPipe,
    FormsModule,
    RouterLink,
    LucideAngularModule,
    LoadingSpinnerComponent,
  ],
  template: `
    <div class="max-w-2xl mx-auto space-y-6">
      <div class="flex items-center gap-4">
        <a routerLink="/marketplace" class="btn btn-ghost btn-sm">
          <lucide-angular [img]="ArrowLeftIcon" class="w-4 h-4"></lucide-angular>
          Back
        </a>
        <h1 class="text-2xl font-bold text-slate-900 dark:text-white">Create Listing</h1>
      </div>

      <app-loading-spinner
        *ngIf="loading"
        size="lg"
        label="Loading projects..."
      ></app-loading-spinner>

      <form *ngIf="!loading" (ngSubmit)="onSubmit()" class="space-y-6">
        <div
          class="bg-white dark:bg-dark-bg-lighter rounded-xl border border-slate-200 dark:border-slate-700 p-6 space-y-4"
        >
          <h2 class="text-lg font-semibold text-slate-900 dark:text-white">Listing Details</h2>

          <div class="space-y-2">
            <label
              for="projectId"
              class="block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Project <span class="text-red-500">*</span>
            </label>
            <select
              id="projectId"
              [(ngModel)]="form.projectId"
              name="projectId"
              required
              class="input w-full"
            >
              <option value="">Select a project</option>
              <option *ngFor="let p of projects" [value]="p.id">{{ p.name }}</option>
            </select>
            <p *ngIf="fieldErrors.projectId" class="text-sm text-red-600 dark:text-red-400">
              {{ fieldErrors.projectId }}
            </p>
          </div>

          <div class="space-y-2">
            <label
              for="amount"
              class="block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Amount (credits) <span class="text-red-500">*</span>
            </label>
            <input
              id="amount"
              [(ngModel)]="form.amount"
              name="amount"
              type="number"
              min="0"
              step="0.0000001"
              required
              placeholder="0.00"
              class="input w-full"
            />
            <p *ngIf="fieldErrors.amount" class="text-sm text-red-600 dark:text-red-400">
              {{ fieldErrors.amount }}
            </p>
          </div>

          <div class="space-y-2">
            <label for="price" class="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Price per credit (XLM) <span class="text-red-500">*</span>
            </label>
            <input
              id="price"
              [(ngModel)]="form.price"
              name="price"
              type="number"
              min="0"
              step="0.01"
              required
              placeholder="0.00"
              class="input w-full"
            />
            <p *ngIf="fieldErrors.price" class="text-sm text-red-600 dark:text-red-400">
              {{ fieldErrors.price }}
            </p>
          </div>

          <div class="space-y-2">
            <label
              for="expiresAt"
              class="block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Expiry Date
              <span class="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              id="expiresAt"
              [(ngModel)]="form.expiresAt"
              name="expiresAt"
              type="date"
              class="input w-full"
            />
          </div>
        </div>

        <div
          class="bg-white dark:bg-dark-bg-lighter rounded-xl border border-slate-200 dark:border-slate-700 p-6 space-y-4"
        >
          <h2 class="text-lg font-semibold text-slate-900 dark:text-white">Review</h2>
          <div class="space-y-3 text-sm">
            <div
              class="flex justify-between py-1 border-b border-slate-100 dark:border-slate-700/50"
            >
              <span class="text-slate-500 dark:text-slate-400">Project</span>
              <span class="font-medium text-slate-900 dark:text-white">{{
                selectedProjectName || '—'
              }}</span>
            </div>
            <div
              class="flex justify-between py-1 border-b border-slate-100 dark:border-slate-700/50"
            >
              <span class="text-slate-500 dark:text-slate-400">Amount</span>
              <span class="font-medium text-slate-900 dark:text-white"
                >{{ form.amount || '0' }} credits</span
              >
            </div>
            <div
              class="flex justify-between py-1 border-b border-slate-100 dark:border-slate-700/50"
            >
              <span class="text-slate-500 dark:text-slate-400">Price</span>
              <span class="font-medium text-slate-900 dark:text-white"
                >{{ form.price || '0' }} XLM per credit</span
              >
            </div>
            <div
              class="flex justify-between py-1 border-b border-slate-100 dark:border-slate-700/50"
            >
              <span class="text-slate-500 dark:text-slate-400">Total Value</span>
              <span class="font-medium text-slate-900 dark:text-white">{{ totalValue }} XLM</span>
            </div>
            <div class="flex justify-between py-1" *ngIf="form.expiresAt">
              <span class="text-slate-500 dark:text-slate-400">Expires</span>
              <span class="font-medium text-slate-900 dark:text-white">{{ form.expiresAt }}</span>
            </div>
          </div>
        </div>

        <div class="flex justify-end gap-3">
          <a routerLink="/marketplace" class="btn btn-ghost">Cancel</a>
          <button
            type="submit"
            [disabled]="!isValid || (submitting$ | async)"
            class="btn btn-primary"
          >
            <lucide-angular [img]="SendIcon" class="w-4 h-4"></lucide-angular>
            {{ (submitting$ | async) ? 'Creating...' : 'Create Listing' }}
          </button>
        </div>
      </form>
    </div>
  `,
})
export class MarketplaceCreateListingComponent implements OnInit, OnDestroy {
  protected readonly ArrowLeftIcon = ArrowLeft;
  protected readonly SendIcon = Send;

  form: CreateListingRequest = {
    projectId: '',
    amount: '',
    price: 0,
  };
  projects: Project[] = [];
  /**
   * Server-reported validation messages keyed by form field, populated from
   * the `field` carried on createListingFailure (HTTP 422/409). Rendered
   * inline against the offending input.
   */
  fieldErrors: Partial<Record<keyof CreateListingRequest, string>> = {};
  loading = true;
  submitting$: Observable<boolean>;

  private destroy$ = new Subject<void>();

  constructor(
    private store: Store<AppState>,
    private actions$: Actions,
    private projectsService: ProjectsService,
    private notificationService: NotificationService,
    private route: ActivatedRoute,
    protected router: Router,
  ) {
    this.submitting$ = this.store.select(selectMarketplaceCreating);
  }

  async ngOnInit(): Promise<void> {
    try {
      const response = await this.projectsService.getProjects({ limit: 100 });
      this.projects = response.data;

      // Deep-linked from the credits portfolio "Sell" action — preselect the project.
      const projectId = this.route.snapshot.queryParamMap.get('projectId');
      if (projectId && this.projects.some((p) => p.id === projectId)) {
        this.form.projectId = projectId;
      }
    } catch {
      this.notificationService.error('Error', 'Failed to load projects');
    } finally {
      this.loading = false;
    }

    // Navigate away after successful creation (handled in effect, but we also
    // listen here so the form resets the submitting flag correctly).
    this.actions$
      .pipe(ofType(MarketplaceActions.createListingSuccess), takeUntil(this.destroy$))
      .subscribe(() => {
        this.router.navigate(['/marketplace']);
      });

    this.actions$
      .pipe(ofType(MarketplaceActions.createListingFailure), takeUntil(this.destroy$))
      .subscribe(({ error, field }) => {
        if (field && this.isFormField(field)) {
          // Field-level failure: show it against the input the server rejected.
          // The generic toast is already raised by MarketplaceEffects.
          this.fieldErrors = { ...this.fieldErrors, [field]: error };
          return;
        }
        this.notificationService.error('Error', error);
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get selectedProjectName(): string {
    return this.projects.find((p) => p.id === this.form.projectId)?.name || '';
  }

  get totalValue(): string {
    const amount = parseFloat(this.form.amount || '0');
    const price = this.form.price || 0;
    return (amount * price).toFixed(2);
  }

  get isValid(): boolean {
    return !!this.form.projectId && parseFloat(this.form.amount) > 0 && this.form.price > 0;
  }

  private static readonly FORM_FIELDS: readonly (keyof CreateListingRequest)[] = [
    'projectId',
    'amount',
    'price',
    'expiresAt',
  ];

  private isFormField(field: string): field is keyof CreateListingRequest {
    return (MarketplaceCreateListingComponent.FORM_FIELDS as readonly string[]).includes(field);
  }

  onSubmit(): void {
    if (!this.isValid) return;
    // Drop stale server-side validation messages before re-submitting.
    this.fieldErrors = {};
    this.store.dispatch(
      MarketplaceActions.createListing({
        data: {
          projectId: this.form.projectId,
          amount: this.form.amount,
          price: this.form.price,
          expiresAt: this.form.expiresAt || undefined,
        },
      }),
    );
  }
}
