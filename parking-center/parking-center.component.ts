import { Component,ElementRef, ViewChild, OnInit, AfterViewInit, OnDestroy } from '@angular/core';
import { GoogleMap, GoogleMapsModule } from '@angular/google-maps';
import { MarkerClusterer } from '@googlemaps/markerclusterer';
import { CommonModule } from '@angular/common';
import { NgZone } from '@angular/core';
import { ModalGoogleMapComponent } from '../modal-google-map/modal-google-map.component';
import { ParkingLocation } from '../../../core/models/googlemap.model';
import { ApiService } from '../../../core/services/api.service';
import { CookieService } from 'ngx-cookie-service';
import { LanguageService } from '../../../core/services/language.service';
import { ToastNotifService } from '../../../core/services/toastNotif.service';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-parking-center',
  imports: [GoogleMapsModule, ModalGoogleMapComponent, CommonModule , FormsModule],
  templateUrl: './parking-center.component.html',
  styleUrl: './parking-center.component.css'
})
export class ParkingCenterComponent  implements OnInit, AfterViewInit, OnDestroy {

  // -- Map ---
  @ViewChild(GoogleMap, { static: false }) map!: GoogleMap;
  @ViewChild('searchBox', { static: false }) searchBox!: ElementRef;

  currentLocation!: google.maps.LatLngLiteral;
  markers: google.maps.Marker[] = [];
  zoom = 12;
  isFirstUpdate = true;
  defaultLocation: google.maps.LatLngLiteral = {
    lat: 13.7563,
    lng: 100.5018,
  };

  // Cluster
  clusterer!: MarkerClusterer;// Marker clusterer instance
  watchId: number | undefined;// Watcher id for geolocation
  currentLocationMarker?: google.maps.Marker;// Marker for current location
  customMarkers: CustomMarker[] = [];

  // Data
  markerPositions : ParkingLocation[] = [
    // { site_id: 1, name: 'Parking PSS 1', lat: 13.7563, lng: 100.5018, available: 12 },
    // { site_id: 2, name: 'Parking PSS 2', lat: 13.7570, lng: 100.5020, available: 0 },
    // { site_id: 3, name: 'Parking PSS 3', lat: 13.9580, lng: 100.5030, available: 3 },
    // { site_id: 4, name: 'Parking PSS 4', lat: 13.609352097265415, lng: 100.62586513790883, available: 20 },
    // { site_id: 5, name: 'Parking PSS 5', lat: 13.607352097265415, lng: 100.62386513790883, available: 1 },
  ];
  phone : string = '012-345-6789';
  email : string = 'L4mYK@example.com';

  // Option UI map
  mapOptions: google.maps.MapOptions = {
    disableDefaultUI: true,
    zoomControl: false,
    fullscreenControl: false,
    mapTypeControl: false,
    streetViewControl: false,
  };

  // Search
  searchLocationMarker?: google.maps.Marker;
  infoWindow = new google.maps.InfoWindow();
  searchLocation?: google.maps.LatLngLiteral;

  // Modal
  showModal = false;
  showLegendModal = false;

  // Other Component
  selectSiteId = 0;
  selectName: string = '';
  selectPosition: google.maps.LatLngLiteral = { lat: 0, lng: 0 };
  selectedAvailable = 0;
  selectedDistance = 0;
  selectedPrice = 0;

  // Style
  activeIndex = -1;
  activeColor = '';
  buttonWidth = 80; // match w-[80px] ใน Tailwind
  nearbyFormLocation = 0;
  menuOpen = false;
  isCustomForm = false; // ใช้สำหรับแสดง/ซ่อนฟอร์มค้นหาตามระยะทางที่กำหนด

  // Token
  token = '';

  // Language
  currentLanguage = '';

  // Length find
  selectedRadius = 100; // เริ่มต้นที่ 500 เมตร
  filteredSpots: ParkingLocation[] = [];

  constructor(
    private ngZone: NgZone , 
    private apiService: ApiService, 
    private cookieService: CookieService,
    private langService: LanguageService,
    private toast: ToastNotifService
  ) {
    this.langService.currentLang$.subscribe(lang => {
      this.currentLanguage = lang;
      console.log('Current language:', this.currentLanguage);
    });
   }

  ngOnInit(): void {
    this.token =
      this.cookieService.get('token_user') ||
      localStorage.getItem('token_user') ||
      '';
    setTimeout(() => {
      this.getParkingLocations(); 
      this.startWatchingPosition();
    }, 100);



    //console.log("Token : " , this.token);
  }

  ngAfterViewInit(): void {
    this.initMarkersAndCluster();
    this.initAutocomplete();
  }

  ngOnDestroy(): void {
    if (this.watchId !== undefined) {
      navigator.geolocation.clearWatch(this.watchId);
    }
  }

  /* ----------------------------------------------- Function ---------------------------------------------*/
  /* --- Style ---*/
  toggleLegend() {
    this.showLegendModal = !this.showLegendModal;
    console.log( this.showLegendModal );
  }
  toggleCustomForm() {
    this.isCustomForm = !this.isCustomForm;
    console.log( "isCustomForm :" , this.isCustomForm );
  }
  selectColor(index: number, color: string) {
    if (this.activeIndex === index) {
      this.activeIndex = -1;
      this.activeColor = '';
    }else{
      this.activeIndex = index;
      this.activeColor = color;
    }

    // เรียก filter ตามสี
    this.filterParkingByColor(this.activeIndex);
  }
  clickNearbyForm( event : number){

    // When click current form
    if( event === this.nearbyFormLocation){
      this.resetMarkers();
      this.centerMapOnCurrentLocation(15);
      this.updateCurrentLocationMarker();
      this.nearbyFormLocation = 0;
      return
    }

    // check event
    if ( event === 2){
      // check current location
      if (this.currentLocation) {
        this.filterNearbyParking_ten_km(this.currentLocation, 10000); // 10,000 meters = 10 km
      } else {
        console.warn('Current location not available yet');
      }
    }
    if ( event === 1 ){
      this.resetMarkers();
      this.fitMapToaMarkers(); // ทำให้ขยายพอดีกับ markers
    }

    this.nearbyFormLocation = event
  }


  toggleMenu() {
    this.menuOpen = !this.menuOpen;
  }




  /* --- ฟังก์ชัน ---*/

  // --- Search ---
  clearSearchBox() {
    if (this.searchBox && this.searchBox.nativeElement) {
      this.searchBox.nativeElement.value = '';
    } else {
      console.warn('searchBox is undefined');
    }
    this.resetMarkers();
  }

  // --- ระยะทาง ---
  onRadiusChange() {
    console.log('ระยะใหม่ (เมตร):', this.selectedRadius , (this.selectedRadius * 1000));
 
    this.filterNearbyParking_custom(this.currentLocation, (this.selectedRadius * 1000));
  } 


  // ----------- Map ----------

  // --- การสร้างเริ่มต้น ---

  // สร้าง marker เริ่มต้น
  initMarkersAndCluster() {    
    // สร้าง marker ตามข้อมูล
    this.markerPositions.forEach(pos => {
      // เรียกใช้ Class เพื่อสร้าง Icon marker 
      this.customMarkers.push( 
          new CustomMarker(
          { lat: pos.lat, lng: pos.lng },
          this.map.googleMap!,
          pos.available,
          () => {
            const position = { lat: pos.lat, lng: pos.lng };
            const distance = this.calculateDistance(this.currentLocation, { lat: pos.lat, lng: pos.lng });
            const price = 100;
            this.openModal( pos.siteId, pos.name ,position, pos.available , distance, price);
          },
          this.ngZone
        ) 
      ); 
    });
    console.log("Create markers : ", this.markerPositions.length);
  }
  // เริ่มตรวจจับตําแหน่งปัจจุบัน
  startWatchingPosition() {
    if (navigator.geolocation) {
      this.watchId = navigator.geolocation.watchPosition(
        (position) => {
          this.currentLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };

          if (this.isFirstUpdate) {
            this.centerMapOnCurrentLocation(15);
            this.isFirstUpdate = false;
          }

          this.updateCurrentLocationMarker();
        },
        (error) => {
          console.error('Geolocation watch error:', error);

          // 🔥 ตั้งค่าตำแหน่งเริ่มต้นถ้าไม่ได้รับ location
          if (this.isFirstUpdate) {
            this.currentLocation = this.defaultLocation;
            this.centerMapOnCurrentLocation(8);
           // this.fitMapToaMarkers(); // ทำให้ขยายพอดีกับ markers
            
            //this.updateCurrentLocationMarker();
            this.isFirstUpdate = false;
          }
        },
        {
          enableHighAccuracy: true,
          maximumAge: 10000,
          timeout: 1000,
        }
      );
    } else {
      console.error('Geolocation not supported');
      // 🔥 Fallback เมื่อ browser ไม่รองรับ
      if (this.isFirstUpdate) {
        this.currentLocation = this.defaultLocation;
        this.centerMapOnCurrentLocation(8);
        //this.fitMapToaMarkers(); // ทำให้ขยายพอดีกับ markers
       
        //this.updateCurrentLocationMarker();
        this.isFirstUpdate = false;
      }
    }
  }

  
  // ---- Modal ----
  openModal( site_id: number , name: string ,position: google.maps.LatLngLiteral ,available: number, distance: number , price: number) {
    this.selectSiteId = site_id;
    this.selectName = name;
    this.selectPosition = position;
    this.selectedAvailable = available;
    this.selectedDistance = distance;
    this.selectedPrice  = price;
    this.showModal = true;
  }

  // ---- Icon ตําแหน่งปัจจุบัน -----
  updateCurrentLocationMarker() {
    if (this.map && this.currentLocation) {
      if (this.currentLocationMarker) {

        const oldPos = this.currentLocationMarker.getPosition();
        const newPos = this.currentLocation;

        // ✅ ตรวจสอบว่าตำแหน่งเปลี่ยนจริงหรือไม่
        if (oldPos && oldPos.lat() === newPos.lat && oldPos.lng() === newPos.lng) {
          console.log('ตำแหน่งเดิม ไม่ต้องอัปเดต');
          return;
        }

        // Move existing marker to new position
        this.currentLocationMarker.setPosition(this.currentLocation);
        this.currentLocationMarker.setMap(this.map.googleMap!);

      } else {
        const blueDotIcon: google.maps.Icon = {
          url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
            <svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" >
              <circle cx="30" cy="30" r="10" fill="#4285F4"/>
              <circle cx="30" cy="30" r="10" fill="#4285F4">
                <animate attributeName="r" from="10" to="25" dur="1.5s" repeatCount="indefinite" begin="0s" fill="freeze" />
                <animate attributeName="opacity" from="0.5" to="0" dur="1.5s" repeatCount="indefinite" begin="0s" fill="freeze" />
              </circle>
            </svg>
          `),
          scaledSize: new google.maps.Size(40, 40),
        };

        // Create marker the current position
        this.currentLocationMarker = new google.maps.Marker({
          position: this.currentLocation,
          map: this.map.googleMap!,
          icon: blueDotIcon,
          zIndex: 0, // ให้อยู่บนสุด
        });

        this.markers.push(this.currentLocationMarker);
        this.initMarkersAndCluster();
      }

      console.log('Current location marker updated', this.currentLocation);
    }
  }

  // ---- จุดจอดรถใกล้เคียง ค้นหา และ ใกล้ฉัน -----
  // generateMarkerIcon(available: number): google.maps.Icon {
  //   let color = '#29d543';
  //   if (available <= 10 && available >= 5) {
  //     color = 'orange';
  //   } else if (available < 5) {
  //     color = '#ee3f29';
  //   }

  //   const svg = `
  //     <svg xmlns="http://www.w3.org/2000/svg" width="60" height="80" viewBox="0 0 60 80" >
  //       <!-- Pin shape -->
  //       <path d="M30 0C13 0 0 13 0 30c0 20 30 50 30 50s30-30 30-50C60 13 47 0 30 0z" fill="${color}"/>
        
  //       <!-- Number circle background -->
  //       <circle cx="30" cy="30" r="15" fill="white"/>
        
  //       <!-- Available number -->
  //       <text x="30" y="36" font-size="16" font-weight="bold" text-anchor="middle" fill="${color}">${available}</text>
  //     </svg>
  //     `;

  //   return {
  //     // url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
  //     url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
  //     scaledSize: new google.maps.Size(50, 50),
  //     anchor: new google.maps.Point(25, 50), // center bottom
  //   };
  // }
  // ----- Icon ใกล้เคียง -----
  filterNearbyParking(center: google.maps.LatLngLiteral, radiusMeters: number) {
    // // 🔴 Clear existing custom markers
    this.customMarkers.forEach(marker => marker.setMap(null));
    this.customMarkers = [];
    //this.resetMarkers();

    // จำลองข้อมูลจุดจอดรถ
    const customMarkerDemo: CustomMarker[] = [];
    this.searchLocation = center; // เก็บตำแหน่งที่ค้นหา

    // 🔥 Filter positions within radius
    const nearbyPositions = this.markerPositions.filter(pos =>
      this.getDistanceMeters(center, { lat: pos.lat, lng: pos.lng }) <= radiusMeters
    );
    console.log( "nearbyPositions", nearbyPositions);

    // 🔥 Create new CustomMarker for each nearby position
    nearbyPositions.forEach(pos => {
      const available = pos.available;
      const distance = this.calculateDistance(this.currentLocation, { lat: pos.lat, lng: pos.lng });
      const price = 100;

      const marker = new CustomMarker(
        { lat: pos.lat, lng: pos.lng },
        this.map.googleMap!,
        available,
        () => this.openModal(  pos.siteId, pos.name,{ lat: pos.lat, lng: pos.lng },available, distance, price),
        this.ngZone
      );

      customMarkerDemo.push(marker);
    });

    this.customMarkers = customMarkerDemo;
    this.customMarkers.forEach(marker => marker.setMap(this.map.googleMap!));

    this.nearbyFormLocation = 0

  }
  filterNearbyParking_ten_km(center: google.maps.LatLngLiteral, radiusMeters: number) {
    // 🔴 Clear existing custom markers
    this.resetMarkers();

    // จำลองข้อมูลจุดจอดรถ
    const customMarkerDemo: CustomMarker[] = [];
    this.searchLocation = center; // เก็บตำแหน่งที่ค้นหา

    // 🔥 Filter positions within radius
    const nearbyPositions = this.markerPositions.filter(pos =>
      this.getDistanceMeters(center, { lat: pos.lat, lng: pos.lng }) <= radiusMeters
    );
    console.log( "nearbyPositions", nearbyPositions);

    // 🔥 Create new CustomMarker for each nearby position
    nearbyPositions.forEach(pos => {
      const available = pos.available;
      const distance = this.calculateDistance(this.currentLocation, { lat: pos.lat, lng: pos.lng });
      const price = 100;

      const marker = new CustomMarker(
        { lat: pos.lat, lng: pos.lng },
        this.map.googleMap!,
        available,
        () => this.openModal(  pos.siteId, pos.name,{ lat: pos.lat, lng: pos.lng },available, distance, price),
        this.ngZone
      );

      customMarkerDemo.push(marker);
    });

    // ตรวจสอบข้อมูลจุดจอดรถว่าง
    if(customMarkerDemo.length > 0) {
      this.customMarkers = customMarkerDemo;
      this.customMarkers.forEach(marker => marker.setMap(this.map.googleMap!));

      this.fitMapToaMarkers_ten_km();
    }
    else{
      console.warn('No markers to fit 10 km');
      this.toast.error('ไม่พบจุดจอดรถใกล้เคียงในระยะ 10 กิโลเมตร');     
    }

    // สำหรับเลื่อนหน้าจอไปตําแหน่งปัจจุบัน
    this.centerMapOnCurrentLocation(15);
    this.updateCurrentLocationMarker();
  }
  filterNearbyParking_custom(center: google.maps.LatLngLiteral, radiusMeters: number) {
    //console.log("Filter data : ", center, radiusMeters);

    //  🔴 Clear existing custom markers
    this.removeMarkers();


    // จำลองข้อมูลจุดจอดรถ
    const customMarkerDemo: CustomMarker[] = [];
    this.searchLocation = center; // เก็บตำแหน่งที่ค้นหา

    // 🔥 Filter positions within radius
    const nearbyPositions = this.markerPositions.filter(pos =>
      this.getDistanceMeters(center, { lat: pos.lat, lng: pos.lng }) <= radiusMeters
    );
    console.log( "nearbyPositions", nearbyPositions);

    // 🔥 Create new CustomMarker for each nearby position
    nearbyPositions.forEach(pos => {
      const available = pos.available;
      const distance = this.calculateDistance(this.currentLocation, { lat: pos.lat, lng: pos.lng });
      const price = 100;

      const marker = new CustomMarker(
        { lat: pos.lat, lng: pos.lng },
        this.map.googleMap!,
        available,
        () => this.openModal(  pos.siteId, pos.name,{ lat: pos.lat, lng: pos.lng },available, distance, price),
        this.ngZone
      );

      customMarkerDemo.push(marker);
    });
    

    
    // ตรวจสอบข้อมูลจุดจอดรถว่าง
    if(customMarkerDemo.length > 0) {
      this.customMarkers = customMarkerDemo;
      this.customMarkers.forEach(marker => marker.setMap(this.map.googleMap!));// สร้าง marker บนแผนที่

      this.fitMapToaMarkers_custom();
    }
    else{
      this.customMarkers = customMarkerDemo;
      this.customMarkers.forEach(marker => marker.setMap(this.map.googleMap!));

      console.warn('No markers to fit custom radius');
      this.toast.error('ไม่พบจุดจอดรถใกล้เคียงในระยะที่กำหนด');     
    }


    // สำหรับเลื่อนหน้าจอไปตําแหน่งปัจจุบัน
    //this.centerMapOnCurrentLocation(15);
    //this.updateCurrentLocationMarker();

  }
 // ----- คํานวณระยะทาง -----
  calculateDistance(p1: google.maps.LatLngLiteral, p2: google.maps.LatLngLiteral): number {
    const R = 6371; // km
    const dLat = (p2.lat - p1.lat) * Math.PI / 180;
    const dLng = (p2.lng - p1.lng) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // ระยะทางหน่วย km
  }


  
  // ----- รีเซ็ต -----
  resetMarkers() {
    // Close infoWindow if open
    this.infoWindow.close();

    // Clear nearby markers
    this.nearbyFormLocation = -1;
    
    // Clear filter
    this.activeIndex = -1;

    // Clear text input
    const input = document.getElementById('search-box') as HTMLInputElement;
    if (input) input.value = '';

    // Remove search location marker
    if (this.searchLocationMarker) {
      this.searchLocationMarker.setMap(null);
      this.searchLocationMarker = undefined;
    }


    // 🔴 Clear custom markers
    this.customMarkers.forEach(marker => marker.setMap(null));
    this.customMarkers = [];
    
    
    // 🔥 Recreate all markers with CustomMarker
    this.markerPositions.forEach(pos => {
      const available = pos.available;
      const distance = this.calculateDistance(this.currentLocation, { lat: pos.lat, lng: pos.lng });
      const price = 100;

      const marker = new CustomMarker(
        { lat: pos.lat, lng: pos.lng },
        this.map.googleMap!,
        available,
        () => this.openModal(  pos.siteId, pos.name,{ lat: pos.lat, lng: pos.lng },available, distance, price),
        this.ngZone
      );

      this.customMarkers.push(marker);
    });

    this.searchLocation = undefined;

    console.log('Markers reset to show all parking');
    // // Clear previous markers
    // this.markers.forEach(marker => marker.setMap(null));
    // //this.clusterer.clearMarkers();

    // // Recreate all markers without filter
    // this.markers = this.markerPositions.map(pos =>
    //   new google.maps.Marker({
    //     position: { lat: pos.lat, lng: pos.lng },
    //     icon: this.generateMarkerIcon(pos.available),
    //   })
    // );

    // //this.clusterer.addMarkers(this.markers);
    

    // this.searchLocation = undefined; // clear search location

    // console.log('Markers reset to show all parking');
  }
  // ----- ลบ marker -----
  removeMarkers() {
    // Clear markers
    this.customMarkers.forEach(marker => marker.setMap(null));
    this.customMarkers = [];

    // Clear markers search
    if (this.searchLocationMarker){
      this.searchLocationMarker.setMap(null);
      this.searchLocationMarker = undefined;
    }

    // Clear forms
    this.nearbyFormLocation = 0;
    


    
    console.log('All markers removed');
  }

  // ----- ค้นหา -----
  async initAutocomplete() {
    const input = document.getElementById('search-box') as HTMLInputElement;
    if (!google.maps.places) {
      console.error('Places library not loaded');
      return;
    }

    const autocomplete = new google.maps.places.Autocomplete(input);
    autocomplete.bindTo("bounds", this.map.googleMap!);

    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      if (!place.geometry || !place.geometry.location) {
        console.error("No geometry found for place");
        return;
      }

      const location = {
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
      };

      // Center map to searched location
      this.map.googleMap!.setCenter(location);
      this.map.googleMap!.setZoom(14);

      // 🔥 Add marker at searched location
      this.addSearchLocationMarker(location);

      // Filter nearby parking
      this.filterNearbyParking(location, 5000); // radius 5 km
    });
  }
  addSearchLocationMarker(location: google.maps.LatLngLiteral) {
    // Remove previous search marker if exists
    if (this.searchLocationMarker) {
      this.searchLocationMarker.setMap(null);
    }

    this.searchLocationMarker = new google.maps.Marker({
      position: location,
      map: this.map.googleMap!,
      icon: {
        url: './icons/search-location.png', // หรือใช้ data URL SVG
        scaledSize: new google.maps.Size(30, 30),
      },
    });
  }

  // ----- คํานวณระยะทางระหว่างจุด -----
  getDistanceMeters(p1: google.maps.LatLngLiteral, p2: google.maps.LatLngLiteral): number {
    const R = 6371e3; // meters
    const φ1 = p1.lat * Math.PI/180;
    const φ2 = p2.lat * Math.PI/180;
    const Δφ = (p2.lat-p1.lat) * Math.PI/180;
    const Δλ = (p2.lng-p1.lng) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    const d = R * c;
    return d;
  }




  // ---- แสดงตำแหน่งปัจจุบัน -----
  centerMapOnCurrentLocation(zoomSet: number ) {
    if (this.map && this.currentLocation) {
      this.map.googleMap!.setCenter(this.currentLocation);
      this.map.googleMap!.setZoom(zoomSet);
    }
    
  }
  // ปุ่มแสดงตำแหน่งปัจจุบัน
  centerMapOnButtonLocation() {
    if (this.map && this.currentLocation) {
      this.map.googleMap!.setCenter(this.currentLocation);
      this.map.googleMap!.setZoom(15);

      this.resetMarkers();
      this.updateCurrentLocationMarker(); // 🔥 เพิ่มบรรทัดนี้
    }
  }


  // ---- แสดงข้อมูลตามจำแนกสี -----
  filterParkingByColor(index: number) {
    let filteredMarkersData: any[] = [];

    switch (index) {
      case 0: // Red < 5
        filteredMarkersData = this.markerPositions.filter(pos => pos.available < 1);
        break;
      case 1: // Yellow 10-9
        filteredMarkersData = this.markerPositions.filter(pos => pos.available >= 1 && pos.available < 10);
        break;
      case 2: // Green >= 10
        filteredMarkersData = this.markerPositions.filter(pos => pos.available >= 10);
        break;
      case -1:
        filteredMarkersData = this.markerPositions;
        break;
    }

    // 🔥 clear markers เดิม
    this.clearCustomMarkers();

    // 🔥 สร้าง marker ใหม่โดยใช้ CustomMarker
    this.customMarkers = filteredMarkersData.map(pos => {
      return new CustomMarker(
        { lat: pos.lat, lng: pos.lng },
        this.map.googleMap!,
        pos.available,
        () => {
          const distance = this.calculateDistance(this.currentLocation, { lat: pos.lat, lng: pos.lng });
          const price = 100;
          this.openModal(  pos.siteId, pos.name,{ lat: pos.lat, lng: pos.lng }, pos.available, distance, price);
        },
        this.ngZone
      );
    });
  }
  clearCustomMarkers() {
  if (this.customMarkers && this.customMarkers.length > 0) {
    this.customMarkers.forEach(marker => {
      if (marker.onRemove) {
        marker.onRemove();
      }
    });
    this.customMarkers = [];
  }
  }

  // ---- การซูมแผนที่โดยรวม ----
  // ทั้งหมด
  fitMapToaMarkers() {
    if (!this.map || !this.map.googleMap) {
      console.warn('Map not ready');
      return;
    }

    const bounds = new google.maps.LatLngBounds();

    // ✅ ใช้ customMarkers ของคุณ
    if (this.customMarkers.length === 0) {
      console.warn('No markers to fit');
      this.toast.error('ไม่พบจุดจอดรถ');
      
      return;
    }

    this.customMarkers.forEach(marker => {
      bounds.extend(new google.maps.LatLng(marker['position']));
    });

    // ✅ Fit map to these bounds
    this.map.googleMap.fitBounds(bounds);

    console.log('Fit map to markers' , this.customMarkers);
  }
  // 10 km
  fitMapToaMarkers_ten_km() {
   if (!this.map || !this.map.googleMap) {
      console.warn('Map not ready');
      return;
    }

    const bounds = new google.maps.LatLngBounds();

    // ✅ ใช้ customMarkers ของคุณ
    if (this.customMarkers.length === 0) {
      console.warn('No markers to fit 10 km');
      this.toast.error('ไม่พบจุดจอดรถใกล้เคียงในระยะ 10 กิโลเมตร');
      
      return;
    }

    this.customMarkers.forEach(marker => {
      bounds.extend(new google.maps.LatLng(marker['position']));
    });

    // ✅ Fit map to these bounds
    this.map.googleMap.fitBounds(bounds);

    console.log('Fit map to markers' , this.customMarkers);
  }
  fitMapToaMarkers_custom() {
   if (!this.map || !this.map.googleMap) {
      console.warn('Map not ready');
      return;
    }

    const bounds = new google.maps.LatLngBounds();

    // ✅ ใช้ customMarkers ของคุณ
    if (this.customMarkers.length === 0) {
      console.warn('No markers to fit custom radius');
      this.toast.error('ไม่พบจุดจอดรถใกล้เคียงในระยะที่กำหนด');
      
      return;
    }

    this.customMarkers.forEach(marker => {
      bounds.extend(new google.maps.LatLng(marker['position']));
    });

    // ✅ Fit map to these bounds
    this.map.googleMap.fitBounds(bounds);

    console.log('Fit map to markers' , this.customMarkers);
  }

  /* ------------------------------------------ API ---------------------------------------- */
  getParkingLocations() {
    this.apiService.ParkingLocation(this.token).subscribe({
      next: (response) => {
        if (response){
          console.log( "Parking Location response : ", response);          
          this.markerPositions = response;

        }
        else{
          console.log("Parking Location response Not Found!");
        }
      }, error: (err) => {
        console.error('โหลดข้อมูลล้มเหลว', err);
      }
    });
  }
    
}

class CustomMarker extends google.maps.OverlayView {
  private div!: HTMLDivElement;

  constructor(
    private position: google.maps.LatLngLiteral,
    private map: google.maps.Map,
    private available: number,
    private onClick: () => void,
    private ngZone: NgZone
  ) {
    super();
    this.map = map;
    this.setMap(map);
    
  }
  
  // เพิ่ม ICON PARKING
  override onAdd() {
    // สร้าง HTML element
    this.div = document.createElement('div');
    this.div.className = 'marker-wrapper';

    // สร้างตัวหนังสือ
    var imagePATH = '';
    if (this.available < 1) {
      imagePATH = './icons/parking-red.png';
    } else if (this.available >= 1 && this.available < 10) {
      imagePATH = './icons/parking-yellow.png';
    } else if (this.available >= 10) {
      imagePATH = './icons/parking-green.png';
    }


    // ✅ innerHTML: ใช้ marker image + overlay number
    this.div.innerHTML = `
      <div style="
        position: relative; 
        width: 55px; 
        height: 40px;" 
        class="z-50"
      >
        <img src="${imagePATH}" style="width: 100%; height: 100%;" />
        <div style="
          position: absolute;
          top: 42%;
          left: 48%;
          transform: translate(-50%, -50%);
          background: white;

          min-width: 35px;
          width: fit-content;
          height: 25px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          font-size: 14px;
          color: black;
        ">
          ${this.available.toLocaleString()}
        </div>
      </div>
    `;

    // ✅ important: set div size
    this.div.style.width = '40px';
    this.div.style.height = '50px';
    this.div.style.position = 'absolute';
    this.div.style.cursor = 'pointer';
    //this.div.style.boxShadow = 'rgba(0, 0, 0, 0.3) 0px 1px 4px -1px';

    // ✅ Event click
    this.div.addEventListener('click', () => {
      this.ngZone.run(() => {
        this.onClick();
      });
    });

    // ✅ เพิ่มเข้าไปใน map overlay
    this.getPanes()!.overlayMouseTarget.appendChild(this.div);
  }


  override draw() {
    const projection = this.getProjection();
    const pos = projection.fromLatLngToDivPixel(new google.maps.LatLng(this.position));
    if (pos && this.div) {
      this.div.style.left = pos.x - 25 + 'px'; // adjust for icon center
      this.div.style.top = pos.y - 50 + 'px';  // adjust for icon bottom
    }
  }

  override onRemove() {
    if (this.div && this.div.parentNode) {
      //this.div.parentNode.removeChild(this.div); // ✅ ลบ DOM
      this.div.remove(); // ✅ ลบ DOM
      console.log('🧹 Marker DOM removed');
    }
  }
}

