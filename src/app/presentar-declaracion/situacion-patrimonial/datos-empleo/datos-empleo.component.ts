import { Component, OnInit } from '@angular/core';
import { FormGroup, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { Apollo } from 'apollo-angular';

import { MatDialog } from '@angular/material/dialog';
import { DialogComponent } from '@shared/dialog/dialog.component';
import { MatSnackBar } from '@angular/material/snack-bar';

import { datosEmpleoCargoComisionQuery, declaracionMutation } from '@api/declaracion';
import { DeclarationErrorStateMatcher } from '@app/presentar-declaracion/shared-presentar-declaracion/declaration-error-state-matcher';
import { Catalogo, DatosEmpleoCargoComision, DeclaracionOutput } from '@models/declaracion';
import AmbitoPublico from '@static/catalogos/ambitoPublico.json';
import Estados from '@static/catalogos/estados.json';
import Municipios from '@static/catalogos/municipios.json';
import NivelOrdenGobierno from '@static/catalogos/nivelOrdenGobierno.json';
import Paises from '@static/catalogos/countries.json';
import { tooltipData } from '@static/tooltips/datos-empleo';
import { findOption } from '@utils/utils';
import { UntilDestroy, untilDestroyed } from '@app/@core';

@UntilDestroy()
@Component({
  selector: 'app-datos-empleo',
  templateUrl: './datos-empleo.component.html',
  styleUrls: ['./datos-empleo.component.scss'],
})
export class DatosEmpleoComponent implements OnInit {
  aclaraciones = false;
  datosEmpleoCargoComisionForm: FormGroup;
  estado: Catalogo = null;
  isLoading = false;

  nivelOrdenGobiernoCatalogo = NivelOrdenGobierno;
  ambitoPublicoCatalogo = AmbitoPublico;
  estadosCatalogo = Estados;
  municipiosCatalogo = Municipios;
  paisesCatalogo = Paises;

  declaracionSimplificada = false;
  tipoDeclaracion: string = null;
  tipoDomicilio = 'MEXICO';

  declaracionId: string = null;

  tooltipData = tooltipData;
  errorMatcher = new DeclarationErrorStateMatcher();

  constructor(
    private apollo: Apollo,
    private dialog: MatDialog,
    private formBuilder: FormBuilder,
    private router: Router,
    private snackBar: MatSnackBar
  ) {
    const urlChunks = this.router.url.split('/');
    this.declaracionSimplificada = urlChunks[2] === 'simplificada';
    this.tipoDeclaracion = urlChunks[1] || null;

    this.createForm();
    this.getUserInfo();
  }

  confirmSaveInfo() {
    const dialogRef = this.dialog.open(DialogComponent, {
      data: {
        title: 'Guardar cambios',
        message: '',
        trueText: 'Guardar',
        falseText: 'Cancelar',
      },
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.saveInfo();
      }
    });
  }

  createForm() {
    this.datosEmpleoCargoComisionForm = this.formBuilder.group({
      nivelOrdenGobierno: [null, [Validators.required]],
      ambitoPublico: [null, [Validators.required]],
      nombreEntePublico: [null, [Validators.required, Validators.pattern(/^\S.*\S$/)]],
      areaAdscripcion: [null, [Validators.required, Validators.pattern(/^\S.*\S$/)]],
      empleoCargoComision: [null, [Validators.required, Validators.pattern(/^\S.*\S$/)]],
      contratadoPorHonorarios: [null, [Validators.required]],
      nivelEmpleoCargoComision: [null, [Validators.required, Validators.pattern(/^\S.*\S$/)]],
      funcionPrincipal: [null, [Validators.required, Validators.pattern(/^\S.*\S$/)]],
      fechaTomaPosesion: [null, [Validators.required]],
      telefonoOficina: this.formBuilder.group({
        telefono: [null, [Validators.pattern(/^\d{10}$/)]],
        extension: [null, [Validators.pattern(/^\d{1,10}$/)]],
      }),
      domicilioMexico: this.formBuilder.group({
        calle: [null, [Validators.required, Validators.pattern(/^\S.*\S$/)]],
        numeroExterior: [null, [Validators.required, Validators.pattern(/^\S.*\S$/)]],
        numeroInterior: [null, [Validators.pattern(/^\S.*$/)]],
        coloniaLocalidad: [null, [Validators.required, Validators.pattern(/^\S.*\S$/)]],
        municipioAlcaldia: [{ disabled: true, value: null }, [Validators.required]],
        entidadFederativa: [null, [Validators.required]],
        codigoPostal: [null, [Validators.required, Validators.pattern(/^\d{5}$/i)]],
      }),
      domicilioExtranjero: this.formBuilder.group({
        calle: [null, [Validators.required, Validators.pattern(/^\S.*\S$/)]],
        numeroExterior: [null, [Validators.required, Validators.pattern(/^\S.*\S$/)]],
        numeroInterior: [null, [Validators.pattern(/^\S.*\S$/)]],
        ciudadLocalidad: [null, [Validators.required, Validators.pattern(/^\S.*\S$/)]],
        estadoProvincia: [null, [Validators.required, Validators.pattern(/^\S.*\S$/)]],
        pais: [null, [Validators.required]],
        codigoPostal: [null, [Validators.required, Validators.pattern(/^\d{5}$/i)]],
      }),
      aclaracionesObservaciones: [
        { disabled: true, value: '' },
        [Validators.required, Validators.pattern(/^\S.*\S?$/)],
      ],
      cuentaConOtroCargoPublico: [
        { disabled: true || this.tipoDeclaracion !== 'modificacion', value: null },
        [Validators.required],
      ],
    });

    this.datosEmpleoCargoComisionForm.get('domicilioExtranjero').disable();

    const estado = this.datosEmpleoCargoComisionForm.get('domicilioMexico').get('entidadFederativa');
    estado.valueChanges.pipe(untilDestroyed(this)).subscribe((value) => {
      const municipio = this.datosEmpleoCargoComisionForm.get('domicilioMexico').get('municipioAlcaldia');

      if (value) {
        municipio.enable();
      } else {
        municipio.disable();
        municipio.reset();
      }
      this.estado = value;
    });
  }

  fillForm(datosEmpleoCargoComision: DatosEmpleoCargoComision) {
    this.datosEmpleoCargoComisionForm.patchValue(datosEmpleoCargoComision || {});

    if (datosEmpleoCargoComision.aclaracionesObservaciones) {
      this.toggleAclaraciones(true);
    }
    this.setSelectedOptions();
  }

  async getUserInfo() {
    try {
      const { data, errors } = await this.apollo
        .query<DeclaracionOutput>({
          query: datosEmpleoCargoComisionQuery,
          variables: {
            tipoDeclaracion: this.tipoDeclaracion.toUpperCase(),
            declaracionCompleta: !this.declaracionSimplificada,
          },
        })
        .toPromise();

      if (errors) {
        throw errors;
      }

      this.declaracionId = data?.declaracion._id;
      this.fillForm(data?.declaracion.datosEmpleoCargoComision);
    } catch (error) {
      console.log(error);
      this.openSnackBar('[ERROR: No se pudo recuperar la información]', 'Aceptar');
    }
  }

  ngOnInit(): void {}

  openSnackBar(message: string, action: string = null) {
    this.snackBar.open(message, action, {
      duration: 5000,
    });
  }

  async saveInfo() {
    try {
      this.isLoading = true;
      const declaracion = {
        datosEmpleoCargoComision: this.datosEmpleoCargoComisionForm.value,
      };

      const { errors } = await this.apollo
        .mutate({
          mutation: declaracionMutation,
          variables: {
            id: this.declaracionId,
            declaracion,
          },
        })
        .toPromise();

      if (errors) {
        throw errors;
      }

      this.isLoading = false;
      this.openSnackBar('Información actualizada', 'Aceptar');
    } catch (error) {
      console.log(error);
      this.openSnackBar('[ERROR: No se guardaron los cambios]', 'Aceptar');
    }
  }

  setSelectedOptions() {
    const { domicilioMexico } = this.datosEmpleoCargoComisionForm.value;

    if (domicilioMexico) {
      this.datosEmpleoCargoComisionForm
        .get('domicilioMexico.entidadFederativa')
        .setValue(findOption(this.estadosCatalogo, domicilioMexico.entidadFederativa.clave));
      this.datosEmpleoCargoComisionForm
        .get('domicilioMexico.municipioAlcaldia')
        .setValue(
          findOption(this.municipiosCatalogo[this.estado?.clave] || [], domicilioMexico.municipioAlcaldia?.clave)
        );
      this.tipoDomicilio = 'MEXICO';
    } else {
      this.tipoDomicilio = 'EXTRANJERO';
    }
  }

  tipoDomicilioChanged(value: any) {
    this.tipoDomicilio = value;
    const notSelectedType = this.tipoDomicilio === 'MEXICO' ? 'domicilioExtranjero' : 'domicilioMexico';
    const selectedType = this.tipoDomicilio === 'EXTRANJERO' ? 'domicilioExtranjero' : 'domicilioMexico';

    const notSelected = this.datosEmpleoCargoComisionForm.get(notSelectedType);
    notSelected.disable();
    notSelected.reset();

    this.datosEmpleoCargoComisionForm.get(selectedType).enable();
  }

  toggleAclaraciones(value: boolean) {
    const aclaraciones = this.datosEmpleoCargoComisionForm.get('aclaracionesObservaciones');
    if (value) {
      aclaraciones.enable();
    } else {
      aclaraciones.disable();
      aclaraciones.reset();
    }
    this.aclaraciones = value;
  }
}
