import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ParkingCenterComponent } from './parking-center.component';

describe('ParkingCenterComponent', () => {
  let component: ParkingCenterComponent;
  let fixture: ComponentFixture<ParkingCenterComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ParkingCenterComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ParkingCenterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
